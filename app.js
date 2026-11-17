// Explorador del currículo de la Comunidad de Madrid.
// - Árbol por asignatura (etapa › asignatura › curso) y árbol por curso (etapa › curso › asignatura).
// - Búsqueda al vuelo, sin tildes ni mayúsculas, en competencias, criterios y contenidos.
// - Pestañas para saltar a competencias, criterios o contenidos dentro de la página de un curso.
// - Selección con casillas (también entre cursos distintos) y copia de la selección.
// Es un script clásico (no un módulo) para que funcione al abrir index.html con doble clic (file://).
// Los datos vienen de datos.js (window.CURRICULO), generado por herramientas/curriculo/generar_web.py.
(function () {
  'use strict';

  const DATOS = window.CURRICULO;
  const vista = document.getElementById('vista');
  if (!DATOS) {
    vista.textContent = 'No se encuentran los datos (datos.js). Comprueba que está en la misma carpeta que index.html.';
    return;
  }

  // ---------------------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------------------

  // Cursos de cada etapa y cómo se nombran
  // (el programa de diversificación curricular se imparte en 3º y 4º de ESO: 1º PDC y 2º PDC)
  const CURSOS_ETAPA = { primaria: [1, 2, 3, 4, 5, 6], eso: [1, 2, 3, 4], diversificacion: [3, 4], bachillerato: [1, 2] };
  const NOMBRE_CORTO = { primaria: 'Primaria', eso: 'ESO', diversificacion: 'PDC', bachillerato: 'Bachillerato' };
  const TIPOS = { comp: 'Competencia', crit: 'Criterio', cont: 'Contenido', bloque: 'Bloque' };
  // Secciones de la página de un curso, en su orden (el índice se usa para ordenar la selección)
  const SECCIONES = [
    { clave: 'comp', id: 'sec-comp', titulo: 'Competencias específicas', corto: 'Competencias', copia: 'COMPETENCIAS ESPECÍFICAS' },
    { clave: 'crit', id: 'sec-crit', titulo: 'Criterios de evaluación', corto: 'Criterios', copia: 'CRITERIOS DE EVALUACIÓN' },
    { clave: 'cont', id: 'sec-cont', titulo: 'Contenidos', corto: 'Contenidos', copia: 'CONTENIDOS' },
  ];
  const PASO_RESULTADOS = 200;

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  // Crea un elemento con atributos (on* = eventos) e hijos (texto, nodos o listas)
  function h(etiqueta, attrs, ...hijos) {
    const el = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const anadir = (x) => {
      if (x === null || x === undefined || x === false) return;
      if (Array.isArray(x)) x.forEach(anadir);
      else el.append(x);
    };
    hijos.forEach(anadir);
    return el;
  }

  // Quita tildes y pasa a minúsculas (para buscar sin distinguir «matemáticas» de «Matematicas»)
  function normalizar(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Divide la búsqueda en palabras normalizadas
  function terminosDe(q) {
    return normalizar(q).split(/\s+/).filter(Boolean);
  }

  // Devuelve el texto con las palabras buscadas dentro de <mark>, respetando las tildes originales
  function resaltar(texto, terminos) {
    const frag = document.createDocumentFragment();
    if (!terminos.length) { frag.append(texto); return frag; }
    // Texto normalizado y, para cada carácter suyo, su posición en el texto original
    let norm = '';
    const mapa = [];
    for (let i = 0; i < texto.length; i++) {
      const n = normalizar(texto[i]);
      for (let k = 0; k < n.length; k++) { norm += n[k]; mapa.push(i); }
    }
    const marcado = new Array(texto.length).fill(false);
    for (const t of terminos) {
      let p = norm.indexOf(t);
      while (p !== -1) {
        for (let k = p; k < p + t.length; k++) marcado[mapa[k]] = true;
        p = norm.indexOf(t, p + t.length);
      }
    }
    // Agrupa los caracteres seguidos con el mismo estado en trozos
    let i = 0;
    while (i < texto.length) {
      let j = i;
      while (j < texto.length && marcado[j] === marcado[i]) j++;
      const trozo = texto.slice(i, j);
      frag.append(marcado[i] ? h('mark', null, trozo) : trozo);
      i = j;
    }
    return frag;
  }

  // Copia un texto al portapapeles (con alternativa para navegadores o páginas sin permiso)
  async function copiar(texto, mensaje) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso(mensaje || 'Copiado');
    } catch {
      const area = h('textarea', { style: 'position:fixed;opacity:0' });
      area.value = texto;
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      aviso(ok ? (mensaje || 'Copiado') : 'No se pudo copiar');
    }
  }

  // Muestra un aviso breve en la parte inferior
  let temporizadorAviso = null;
  function aviso(texto) {
    const el = document.getElementById('aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, 1600);
  }

  // Lee y guarda preferencias del navegador sin fallar si el almacenamiento está bloqueado
  function leerPreferencia(clave, porDefecto) {
    try { return localStorage.getItem(`curriculo.${clave}`) || porDefecto; } catch { return porDefecto; }
  }
  function guardarPreferencia(clave, valor) {
    try { localStorage.setItem(`curriculo.${clave}`, valor); } catch { /* sin almacenamiento: no pasa nada */ }
  }

  // Pone en mayúscula inicial un texto escrito todo en mayúsculas («MATEMÁTICAS A» → «Matemáticas A»)
  function sinMayusculas(texto) {
    if (texto !== texto.toUpperCase()) return texto;
    return texto.toLowerCase().replace(/(^|\s)(\S)(?=\s|$)/g, (m) => m.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
  }

  // ---------------------------------------------------------------------------
  // Preparación de los datos
  // ---------------------------------------------------------------------------

  const ETAPAS = {};
  DATOS.etapas.forEach((e) => { ETAPAS[e.clave] = e; });

  // Cada curso o ciclo («nivel») recibe un identificador «materia.nivel» y una referencia a su materia
  const NIVELES = new Map();
  DATOS.materias.forEach((m, mi) => {
    m.indice = mi;
    m.niveles.forEach((n, ni) => {
      n.id = `${mi}.${ni}`;
      n.indice = ni;
      n.materia = m;
      NIVELES.set(n.id, n);
    });
  });

  // Competencias que se muestran en un nivel: las comunes de la materia (ESO, Bach.) o las del ciclo (Primaria)
  function competenciasDe(n) {
    return n.materia.competencias.length ? n.materia.competencias : n.competencias;
  }

  // Nombre de un curso: «2º ESO», «5º Primaria», «1º PDC (3º ESO)»…
  function nombreCurso(etapa, curso) {
    if (etapa === 'diversificacion') return `${curso - 2}º PDC (${curso}º ESO)`;
    return `${curso}º ${NOMBRE_CORTO[etapa] || etapa}`;
  }

  // Indica si un nivel corresponde a un curso (los niveles sin cursos valen para toda la etapa)
  function nivelEnCurso(nivel, etapa, curso) {
    if (nivel.materia.etapa !== etapa) return false;
    return !nivel.cursos.length || nivel.cursos.includes(curso);
  }

  // Nombre del nivel dentro del árbol por curso: la asignatura (con su variante si la hay)
  function nombreEnCurso(nivel) {
    const m = nivel.materia;
    let texto = m.nombre;
    if (nivel.variante) {
      const v = sinMayusculas(nivel.variante);
      texto = normalizar(v).startsWith(normalizar(m.nombre)) ? v : `${m.nombre} · ${v}`;
    }
    return texto;
  }

  // Índices de los contenidos que cuelgan de uno (los siguientes con más sangría)
  function hijosContenido(bloque, ii) {
    const base = bloque.items[ii].nivel || 0;
    const hijos = [];
    for (let k = ii + 1; k < bloque.items.length && (bloque.items[k].nivel || 0) > base; k++) hijos.push(k);
    return hijos;
  }

  // Texto de un contenido para copiar, con su sangría relativa
  function lineaContenido(it, base) {
    return `${'  '.repeat(Math.max(0, (it.nivel || 0) - (base || 0)))}- ${it.texto}`;
  }

  // Índice de búsqueda: una entrada por competencia, criterio, bloque y contenido
  const ENTRADAS = [];
  function anadirEntrada(tipo, texto, nivel, ancla, codigo, comun) {
    ENTRADAS.push({ tipo, texto, norm: normalizar(texto), nivel, ancla, codigo: codigo || '', comun: !!comun });
  }
  DATOS.materias.forEach((m) => {
    if (!m.niveles.length) return;
    // Competencias comunes a toda la materia (ESO y Bachillerato)
    m.competencias.forEach((c) => anadirEntrada('comp', c.texto, m.niveles[0], `comp-${c.numero}`, `CE ${c.numero}`, true));
    m.niveles.forEach((n) => {
      // Competencias propias del ciclo (Primaria)
      n.competencias.forEach((c) => anadirEntrada('comp', c.texto, n, `comp-${c.numero}`, `CE ${c.numero}`));
      n.criterios.forEach((c, k) => anadirEntrada('crit', c.texto, n, `crit-${k}`, c.codigo));
      n.contenidos.forEach((b, bi) => {
        anadirEntrada('bloque', b.titulo, n, `bloque-${bi}`);
        b.items.forEach((it, ii) => anadirEntrada('cont', it.texto, n, `cont-${bi}-${ii}`));
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Selección con casillas (se conserva al cambiar de curso y al recargar la página)
  // ---------------------------------------------------------------------------

  const SELECCION = new Map();   // clave → elemento descrito por describir()

  // Describe un elemento seleccionable: clave única, grupo (curso o materia), orden y texto a copiar
  function describir(nivel, ancla) {
    const m = nivel.materia;
    const [tipo, a, b] = ancla.split('-');
    const grupoNivel = { grupo: nivel.id, grupoTitulo: `${m.nombre} — ${nivel.etiqueta}`, grupoOrden: m.indice * 1000 + nivel.indice + 1 };
    if (tipo === 'comp') {
      const c = competenciasDe(nivel).find((x) => String(x.numero) === a);
      if (!c) return null;
      // Las competencias comunes se agrupan por materia, para no repetirlas en cada curso
      const grupo = m.competencias.length
        ? { grupo: `m${m.indice}`, grupoTitulo: `${m.nombre} — ${ETAPAS[m.etapa].nombre} (todos los cursos)`, grupoOrden: m.indice * 1000 }
        : grupoNivel;
      return { ...grupo, clave: `${grupo.grupo}|${ancla}`, nivelId: nivel.id, ancla, seccion: 0, pos: c.numero, texto: `${c.numero}. ${c.texto}` };
    }
    if (tipo === 'crit') {
      const c = nivel.criterios[+a];
      if (!c) return null;
      return { ...grupoNivel, clave: `${nivel.id}|${ancla}`, nivelId: nivel.id, ancla, seccion: 1, pos: +a, texto: `${c.codigo} ${c.texto}` };
    }
    if (tipo === 'cont') {
      const bloque = nivel.contenidos[+a];
      const it = bloque && bloque.items[+b];
      if (!it) return null;
      return { ...grupoNivel, clave: `${nivel.id}|${ancla}`, nivelId: nivel.id, ancla, seccion: 2, pos: +a * 100000 + +b,
        bloque: +a, bloqueTitulo: bloque.titulo, texto: lineaContenido(it) };
    }
    return null;
  }

  // Marca o desmarca un elemento (y, en los contenidos, los que cuelgan de él)
  function marcarElemento(nivelId, ancla, marcado) {
    const nivel = NIVELES.get(nivelId);
    if (!nivel) return;
    const anclas = [ancla];
    const [tipo, a, b] = ancla.split('-');
    if (tipo === 'cont' && nivel.contenidos[+a]) hijosContenido(nivel.contenidos[+a], +b).forEach((k) => anclas.push(`cont-${a}-${k}`));
    for (const an of anclas) {
      const d = describir(nivel, an);
      if (!d) continue;
      if (marcado) SELECCION.set(d.clave, d);
      else SELECCION.delete(d.clave);
    }
  }

  // Texto de toda la selección, ordenada como en el currículo y agrupada por curso y sección
  function textoSeleccion() {
    const lista = [...SELECCION.values()].sort((x, y) => x.grupoOrden - y.grupoOrden || x.seccion - y.seccion || x.pos - y.pos);
    const lineas = [];
    let grupo = null, seccion = null, bloque = null;
    for (const e of lista) {
      if (e.grupo !== grupo) {
        if (lineas.length) lineas.push('');
        lineas.push(e.grupoTitulo);
        grupo = e.grupo; seccion = null;
      }
      if (e.seccion !== seccion) {
        lineas.push('', SECCIONES[e.seccion].copia);
        seccion = e.seccion; bloque = null;
      }
      if (e.seccion === 2 && e.bloque !== bloque) {
        lineas.push(e.bloqueTitulo);
        bloque = e.bloque;
      }
      lineas.push(e.texto);
    }
    return lineas.join('\n');
  }

  // Guarda la selección en el navegador para no perderla al recargar
  function guardarSeleccion() {
    guardarPreferencia('seleccion', JSON.stringify([...SELECCION.values()].map((e) => [e.nivelId, e.ancla])));
  }

  // Recupera la selección guardada (ignorando lo que ya no exista)
  function cargarSeleccion() {
    try {
      for (const [nivelId, ancla] of JSON.parse(leerPreferencia('seleccion', '[]'))) {
        const nivel = NIVELES.get(nivelId);
        const d = nivel && describir(nivel, ancla);
        if (d) SELECCION.set(d.clave, d);
      }
    } catch { SELECCION.clear(); }
  }

  // Pone cada casilla de la página según la selección y actualiza la barra inferior
  function refrescarSeleccion() {
    document.querySelectorAll('input.tick').forEach((t) => { t.checked = SELECCION.has(t.dataset.clave); });
    // Casillas de grupo: marcadas si están todos, a medias si hay alguno
    document.querySelectorAll('input.tick-grupo').forEach((t) => {
      const ticks = t.contenedor ? [...t.contenedor().querySelectorAll('input.tick')] : [];
      const marcados = ticks.filter((x) => x.checked).length;
      t.checked = ticks.length > 0 && marcados === ticks.length;
      t.indeterminate = marcados > 0 && marcados < ticks.length;
    });
    const barra = document.getElementById('barra-seleccion');
    const n = SELECCION.size;
    barra.hidden = n === 0;
    document.getElementById('sel-cuenta').textContent = `${n} elemento${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`;
    document.body.classList.toggle('con-seleccion', n > 0);
  }

  // Se llama tras cada cambio de la selección
  function alCambiarSeleccion() {
    guardarSeleccion();
    refrescarSeleccion();
  }

  // Casilla de un elemento
  function tick(nivel, ancla) {
    const d = describir(nivel, ancla);
    if (!d) return null;
    return h('input', {
      type: 'checkbox', class: 'tick', 'data-clave': d.clave, 'data-nivel': nivel.id, 'data-ancla': ancla,
      title: 'Seleccionar para copiar', 'aria-label': 'Seleccionar',
      onclick: (ev) => ev.stopPropagation(),
      onchange: (ev) => { marcarElemento(nivel.id, ancla, ev.target.checked); alCambiarSeleccion(); },
    });
  }

  // Casilla de grupo: marca o desmarca todas las casillas que hay dentro del contenedor
  function tickGrupo(obtenerContenedor, titulo) {
    const t = h('input', {
      type: 'checkbox', class: 'tick-grupo', title: titulo || 'Seleccionar todo', 'aria-label': titulo || 'Seleccionar todo',
      onclick: (ev) => ev.stopPropagation(),
      onchange: () => {
        const marcar = t.checked;
        obtenerContenedor().querySelectorAll('input.tick').forEach((x) => marcarElemento(x.dataset.nivel, x.dataset.ancla, marcar));
        alCambiarSeleccion();
      },
    });
    t.contenedor = obtenerContenedor;
    return t;
  }

  // ---------------------------------------------------------------------------
  // Ruta (en el #hash de la dirección, para poder usar Atrás y compartir enlaces)
  //   n = nivel abierto · a = elemento al que saltar · q = búsqueda
  // ---------------------------------------------------------------------------

  // Lee el estado de la dirección
  function leerRuta() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { n: p.get('n') || '', a: p.get('a') || '', q: p.get('q') || '' };
  }

  // Construye el #hash a partir de un estado
  function hashDe(estado) {
    const p = new URLSearchParams();
    for (const k of ['n', 'a', 'q']) if (estado[k]) p.set(k, estado[k]);
    const s = p.toString();
    return s ? `#${s}` : '#';
  }

  // Cambia la dirección: «reemplazar» no crea una entrada nueva en el historial (al escribir)
  function irA(estado, reemplazar) {
    const nuevo = hashDe(estado);
    if (reemplazar) {
      history.replaceState(null, '', nuevo === '#' ? location.pathname + location.search : nuevo);
      pintar();
    } else if (nuevo !== hashDe(leerRuta())) {
      // Cambia la dirección y el evento hashchange vuelve a pintar
      location.hash = nuevo;
    } else {
      // Misma ruta (p. ej., sin # y «#»): no hay hashchange, se pinta a mano
      pintar();
    }
  }

  // ---------------------------------------------------------------------------
  // Árboles del índice
  // ---------------------------------------------------------------------------

  const arbolMaterias = document.getElementById('arbol-materias');
  const arbolCursos = document.getElementById('arbol-cursos');

  // Enlace a un nivel desde el árbol
  function enlaceNivel(nivel, texto, nota) {
    return h('a', {
      href: hashDe({ n: nivel.id }),
      'data-nivel': nivel.id,
      onclick: () => document.body.classList.remove('indice-abierto'),
    }, texto, nota ? h('span', { class: 'nota' }, ` ${nota}`) : null);
  }

  // Árbol por asignatura: etapa › asignatura › curso o ciclo
  function construirArbolMaterias() {
    for (const etapa of DATOS.etapas) {
      const materias = DATOS.materias.filter((m) => m.etapa === etapa.clave && m.niveles.length);
      arbolMaterias.append(h('details', { class: 'etapa', open: true, 'data-etapa': etapa.clave },
        h('summary', null, etapa.nombre),
        materias.map((m) => h('details', { 'data-materia': m.indice },
          h('summary', null, m.nombre),
          m.niveles.map((n) => enlaceNivel(n, n.etiqueta))))));
    }
  }

  // Árbol por curso: etapa › curso › asignatura
  function construirArbolCursos() {
    for (const etapa of DATOS.etapas) {
      const cursos = CURSOS_ETAPA[etapa.clave] || [];
      arbolCursos.append(h('details', { class: 'etapa', open: true, 'data-etapa': etapa.clave },
        h('summary', null, etapa.nombre),
        cursos.map((curso) => {
          const niveles = [...NIVELES.values()].filter((n) => nivelEnCurso(n, etapa.clave, curso));
          return h('details', { 'data-curso': curso },
            h('summary', null, nombreCurso(etapa.clave, curso), h('span', { class: 'nota' }, ` (${niveles.length})`)),
            niveles.map((n) => enlaceNivel(n, nombreEnCurso(n),
              !n.cursos.length ? '(toda la etapa)' : n.cursos.length > 1 ? `(ciclo ${n.cursos.join('º-')}º)` : '')));
        })));
    }
  }

  // Oculta en los dos árboles lo que no es de la etapa y el curso elegidos en los menús
  function aplicarFiltroArbol() {
    const etapa = fEtapa.value;
    const curso = +fCurso.value;
    const nivelVisible = (n) => (!etapa || n.materia.etapa === etapa) && (!curso || nivelEnCurso(n, etapa, curso));
    document.querySelectorAll('.arbol details.etapa').forEach((d) => {
      d.hidden = !!etapa && d.dataset.etapa !== etapa;
      if (etapa && !d.hidden) d.open = true;
    });
    // Árbol por asignatura: cursos y asignaturas que quedan
    arbolMaterias.querySelectorAll('a[data-nivel]').forEach((a) => { a.hidden = !nivelVisible(NIVELES.get(a.dataset.nivel)); });
    arbolMaterias.querySelectorAll('details[data-materia]').forEach((d) => {
      d.hidden = !d.querySelector('a[data-nivel]:not([hidden])');
      if (curso && !d.hidden) d.open = true;
    });
    // Árbol por curso: solo el curso elegido, abierto
    arbolCursos.querySelectorAll('details[data-curso]').forEach((d) => {
      d.hidden = !!curso && +d.dataset.curso !== curso;
      if (curso && !d.hidden) d.open = true;
    });
    document.getElementById('f-quitar').hidden = !etapa;
  }

  // Muestra el árbol elegido (y recuerda la elección)
  function elegirArbol(cual) {
    document.querySelectorAll('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.arbol === cual));
    arbolMaterias.hidden = cual !== 'materias';
    arbolCursos.hidden = cual !== 'cursos';
    guardarPreferencia('arbol', cual);
    marcarEnArbol(leerRuta().n);
  }

  // Resalta el nivel abierto en los dos árboles y despliega sus carpetas
  function marcarEnArbol(nivelId) {
    document.querySelectorAll('.arbol a.activo').forEach((a) => a.classList.remove('activo'));
    if (!nivelId) return;
    document.querySelectorAll(`.arbol a[data-nivel="${CSS.escape(nivelId)}"]`).forEach((a) => {
      a.classList.add('activo');
      for (let p = a.parentElement; p && !p.classList.contains('arbol'); p = p.parentElement) {
        if (p.tagName === 'DETAILS') p.open = true;
      }
    });
    // En el árbol visible, se desplaza hasta el primero
    const visible = document.querySelector('.arbol:not([hidden]) a.activo');
    if (visible) visible.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // Filtros de búsqueda
  // ---------------------------------------------------------------------------

  const campo = document.getElementById('q');
  const fEtapa = document.getElementById('f-etapa');
  const fCurso = document.getElementById('f-curso');
  const casillas = { comp: document.getElementById('t-comp'), crit: document.getElementById('t-crit'), cont: document.getElementById('t-cont') };

  // Rellena el desplegable de etapas
  DATOS.etapas.forEach((e) => fEtapa.append(h('option', { value: e.clave }, e.nombre)));

  // Rellena el desplegable de cursos según la etapa elegida
  function rellenarCursos() {
    const etapa = fEtapa.value;
    const anterior = fCurso.value;
    fCurso.replaceChildren(h('option', { value: '' }, 'Todos'));
    (CURSOS_ETAPA[etapa] || []).forEach((c) => fCurso.append(h('option', { value: c }, nombreCurso(etapa, c))));
    fCurso.value = (CURSOS_ETAPA[etapa] || []).includes(+anterior) ? anterior : '';
    fCurso.disabled = !etapa;
  }

  // Indica si una entrada pasa los filtros de etapa, curso y tipo
  function pasaFiltros(e) {
    const tipo = e.tipo === 'bloque' ? 'cont' : e.tipo;
    if (!casillas[tipo].checked) return false;
    const etapa = fEtapa.value;
    if (etapa && e.nivel.materia.etapa !== etapa) return false;
    const curso = +fCurso.value;
    if (etapa && curso) {
      // Las competencias comunes valen si la materia tiene algún nivel de ese curso
      const niveles = e.comun ? e.nivel.materia.niveles : [e.nivel];
      if (!niveles.some((n) => nivelEnCurso(n, etapa, curso))) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Vistas
  // ---------------------------------------------------------------------------

  // Portada: qué hay y cómo se usa
  function pintarPortada() {
    let comp = 0, crit = 0, cont = 0;
    ENTRADAS.forEach((e) => { if (e.tipo === 'comp') comp++; else if (e.tipo === 'crit') crit++; else if (e.tipo === 'cont') cont++; });
    vista.replaceChildren(h('div', { class: 'portada' },
      h('h2', null, 'Currículo de Primaria, ESO, diversificación curricular y Bachillerato de la Comunidad de Madrid'),
      h('p', null, 'Elige una asignatura o un curso en el índice de la izquierda, o escribe en el buscador: los resultados aparecen mientras escribes, sin tener en cuenta tildes ni mayúsculas.'),
      h('div', { class: 'cifras' },
        [[DATOS.materias.length, 'asignaturas'], [NIVELES.size, 'cursos o ciclos'], [comp, 'competencias específicas'],
          [crit, 'criterios de evaluación'], [cont, 'contenidos']]
          .map(([n, t]) => h('div', { class: 'cifra' }, h('strong', null, n.toLocaleString('es-ES')), h('span', null, t)))),
      h('h3', null, 'Normativa'),
      h('ul', { class: 'normas' }, DATOS.etapas.map((e) => h('li', null, h('strong', null, `${e.nombre}: `), e.norma))),
      h('h3', null, 'Consejos'),
      h('ul', null,
        h('li', null, 'Pulsa ', h('kbd', null, '/'), ' para ir al buscador y ', h('kbd', null, 'Esc'), ' para borrarlo.'),
        h('li', null, 'Varias palabras buscan elementos que contengan todas: «fracciones problemas».'),
        h('li', null, 'Los menús Etapa y Curso filtran el índice y la búsqueda; sin búsqueda, muestran las asignaturas de esa etapa o curso.'),
        h('li', null, 'Dentro de un curso, las pestañas Competencias, Criterios y Contenidos llevan a cada sección.'),
        h('li', null, 'Marca las casillas ☑ de lo que quieras (también de cursos distintos o de los resultados de búsqueda) y pulsa «Copiar selección» abajo.'),
        h('li', null, 'Cada criterio tiene «Copiar criterio completo» (la competencia con todos sus criterios: 1, 1.1, 1.2…). Un contenido se copia con sus subapartados.'),
        h('li', null, 'La dirección de la página cambia al navegar: puedes guardarla en favoritos o compartirla.'))));
  }

  // Asignaturas de la etapa (y curso) elegidos en los menús
  function pintarListado(etapa, curso) {
    const e = ETAPAS[etapa];
    const niveles = [...NIVELES.values()].filter((n) => n.materia.etapa === etapa && (!curso || nivelEnCurso(n, etapa, curso)));
    const contenido = [
      h('div', { class: 'migas' }, e.nombre),
      h('h2', { class: 'titulo-nivel' }, curso ? nombreCurso(etapa, curso) : e.nombre),
      h('p', { class: 'subtitulo' }, e.norma),
    ];
    if (curso) {
      // Un curso: una tarjeta por asignatura
      contenido.push(h('p', { class: 'resumen' }, `${niveles.length} asignaturas o ámbitos. Elige una para ver su currículo.`),
        h('div', { class: 'tarjetas' }, niveles.map((n) => h('a', { class: 'tarjeta', href: hashDe({ n: n.id }) },
          h('strong', null, nombreEnCurso(n)),
          h('span', null, n.etiqueta)))));
    } else {
      // Una etapa: cada asignatura con sus cursos
      const materias = DATOS.materias.filter((m) => m.etapa === etapa && m.niveles.length);
      contenido.push(h('p', { class: 'resumen' }, `${materias.length} asignaturas o ámbitos. Elige un curso en el menú «Curso» o pulsa uno de los de abajo.`),
        h('div', { class: 'tarjetas' }, materias.map((m) => h('div', { class: 'tarjeta' },
          h('strong', null, m.nombre),
          h('div', { class: 'acciones' }, m.niveles.map((n) => h('a', { class: 'chip', href: hashDe({ n: n.id }) }, n.etiqueta)))))));
    }
    vista.replaceChildren(...contenido);
    window.scrollTo(0, 0);
  }

  // Resultados de la búsqueda, agrupados por asignatura y curso
  let limiteResultados = PASO_RESULTADOS;
  function pintarResultados(q) {
    const terminos = terminosDe(q);
    const encontrados = ENTRADAS.filter((e) => terminos.every((t) => e.norm.includes(t)) && pasaFiltros(e));
    // Asignaturas cuyo nombre coincide (atajo para abrirlas)
    const materias = DATOS.materias.filter((m) => m.niveles.length && (!fEtapa.value || m.etapa === fEtapa.value)
      && terminos.every((t) => normalizar(m.nombre).includes(t)));

    const contenido = [];
    contenido.push(h('p', { class: 'resumen' },
      encontrados.length
        ? `${encontrados.length.toLocaleString('es-ES')} resultado${encontrados.length === 1 ? '' : 's'} para «${q.trim()}»`
        : `Sin resultados para «${q.trim()}». Prueba con menos palabras o quita filtros.`));
    if (materias.length) {
      contenido.push(h('div', { class: 'coinciden' },
        materias.slice(0, 20).map((m) => h('a', { class: 'chip', href: hashDe({ n: m.niveles[0].id }) },
          `${m.nombre} · ${NOMBRE_CORTO[m.etapa]}`))));
    }

    // Agrupa por nivel conservando el orden del currículo
    const grupos = new Map();
    for (const e of encontrados.slice(0, limiteResultados)) {
      if (!grupos.has(e.nivel.id)) grupos.set(e.nivel.id, []);
      grupos.get(e.nivel.id).push(e);
    }
    for (const [id, entradas] of grupos) {
      const n = NIVELES.get(id);
      const seccion = h('section', { class: 'grupo' });
      seccion.append(
        h('h3', null, tickGrupo(() => seccion, 'Seleccionar todos los resultados de este curso'), ' ',
          h('a', { href: hashDe({ n: id, q }) }, n.materia.nombre), ' ',
          h('span', { class: 'sub' }, `· ${n.etiqueta} · ${ETAPAS[n.materia.etapa].nombre}`)),
        ...entradas.map((e) => h('div', { class: 'resultado' },
          e.tipo === 'bloque' ? h('span', { class: 'tick-hueco' }) : tick(e.nivel, e.ancla),
          h('a', { href: hashDe({ n: e.nivel.id, a: e.ancla, q }) },
            h('span', { class: `tipo ${e.tipo}` }, TIPOS[e.tipo] + (e.codigo ? ` ${e.codigo}` : '')),
            resaltar(e.texto, terminos)))));
      contenido.push(seccion);
    }
    if (encontrados.length > limiteResultados) {
      contenido.push(h('button', {
        class: 'boton mas', type: 'button',
        onclick: () => { limiteResultados += PASO_RESULTADOS; pintarResultados(q); },
      }, `Ver más (${(encontrados.length - limiteResultados).toLocaleString('es-ES')} restantes)`));
    }
    vista.replaceChildren(...contenido);
    refrescarSeleccion();
  }

  // Textos planos de un nivel (para los botones «Copiar»)
  function textoCompetencias(lista) {
    return ['COMPETENCIAS ESPECÍFICAS', ...lista.map((c) => `${c.numero}. ${c.texto}`)].join('\n');
  }
  function textoCriterios(n) {
    return ['CRITERIOS DE EVALUACIÓN', ...n.criterios.map((c) => `${c.codigo} ${c.texto}`)].join('\n');
  }
  function textoBloque(b) {
    return [b.titulo, ...b.items.map((it) => lineaContenido(it))].join('\n');
  }
  function textoContenidos(n) {
    return ['CONTENIDOS', ...n.contenidos.map((b) => `\n${textoBloque(b)}`)].join('\n');
  }
  function textoNivel(n) {
    return [`${n.materia.nombre} — ${n.etiqueta}`, '', textoCompetencias(competenciasDe(n)), '', textoCriterios(n), '', textoContenidos(n)].join('\n');
  }

  // Criterio completo: la competencia (criterio «1») seguida de todos sus criterios (1.1, 1.2…)
  function textoCriterioCompleto(n, numero, lista) {
    const comp = competenciasDe(n).find((c) => c.numero === numero);
    return [`${numero}. ${comp ? comp.texto : `Competencia específica ${numero}`}`, ...lista.map(([c]) => `${c.codigo} ${c.texto}`)].join('\n');
  }

  // Botón «Copiar» que no abre ni cierra la sección al pulsarlo
  function botonCopiar(obtenerTexto, etiqueta, titulo) {
    return h('button', {
      class: 'boton', type: 'button', title: titulo || null,
      onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); copiar(obtenerTexto()); },
    }, etiqueta || '⧉ Copiar');
  }

  // Elemento de una lista: casilla, contenido y botón de copiar
  function elemento(nivel, ancla, contenido, textoACopiar, clase, tituloCopiar) {
    return h('li', { id: ancla, class: clase || null },
      tick(nivel, ancla),
      h('span', { class: 'texto' }, contenido),
      h('button', { class: 'copiar', type: 'button', title: tituloCopiar || 'Copiar', 'aria-label': tituloCopiar || 'Copiar', onclick: () => copiar(textoACopiar) }, '⧉'));
  }

  // Sección desplegable de la página de un curso, con casilla «todo», contador y «Copiar»
  function seccion(s, cuenta, obtenerTexto, cuerpo) {
    const det = h('details', { class: `seccion ${s.clave}`, id: s.id, open: true });
    det.append(
      h('summary', null,
        tickGrupo(() => det, `Seleccionar todos los ${s.corto.toLowerCase()}`),
        s.titulo, h('span', { class: 'cuenta' }, `(${cuenta})`),
        botonCopiar(obtenerTexto)),
      h('div', { class: 'dentro' }, cuerpo));
    return det;
  }

  // Pestañas para saltar a cada sección de la página
  function pestanasSecciones(cuentas) {
    return h('nav', { class: 'saltos', 'aria-label': 'Secciones' },
      SECCIONES.map((s, i) => h('a', {
        href: hashDe(leerRuta()), 'data-destino': s.id,
        onclick: (ev) => { ev.preventDefault(); irASeccion(s.id); },
      }, s.corto, h('span', { class: 'cuenta' }, cuentas[i]))));
  }

  // Abre una sección y la lleva arriba de la pantalla
  function irASeccion(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Marca la pestaña de la sección que se está leyendo
  function actualizarPestanaActiva() {
    const enlaces = [...document.querySelectorAll('.saltos a')];
    if (!enlaces.length) return;
    const saltos = document.querySelector('.saltos');
    const limite = saltos.getBoundingClientRect().bottom + 12;
    let activa = enlaces[0].dataset.destino;
    for (const a of enlaces) {
      const el = document.getElementById(a.dataset.destino);
      if (el && el.getBoundingClientRect().top <= limite) activa = a.dataset.destino;
    }
    // Al llegar al final de la página, la última sección
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) activa = enlaces[enlaces.length - 1].dataset.destino;
    enlaces.forEach((a) => a.classList.toggle('activa', a.dataset.destino === activa));
  }

  // Vista de un curso o ciclo: competencias, criterios (por competencia) y contenidos (por bloque)
  function pintarNivel(n, ancla, q) {
    const m = n.materia;
    const terminos = terminosDe(q);
    const competencias = competenciasDe(n);
    const marcar = (texto) => resaltar(texto, terminos);

    // Criterios agrupados por la competencia a la que pertenecen
    const porCompetencia = new Map();
    n.criterios.forEach((c, k) => {
      if (!porCompetencia.has(c.competencia)) porCompetencia.set(c.competencia, []);
      porCompetencia.get(c.competencia).push([c, k]);
    });
    const nContenidos = n.contenidos.reduce((s, b) => s + b.items.length, 0);

    // Competencias
    const secComp = seccion(SECCIONES[0], competencias.length, () => textoCompetencias(competencias),
      competencias.length
        ? h('ol', { class: 'lista' }, competencias.map((c) => elemento(n, `comp-${c.numero}`,
          [h('span', { class: 'cod' }, `${c.numero}.`), marcar(c.texto)], `${c.numero}. ${c.texto}`)))
        : h('p', { class: 'vacio' }, 'Sin competencias específicas en esta asignatura.'));

    // Criterios: un grupo por competencia, con casilla de grupo y «Copiar criterio completo»
    const secCrit = seccion(SECCIONES[1], n.criterios.length, () => textoCriterios(n),
      [...porCompetencia].map(([num, lista]) => {
        const comp = competencias.find((c) => c.numero === num);
        const grupo = h('div', { class: 'grupo-criterio' });
        grupo.append(
          h('h4', null,
            tickGrupo(() => grupo, `Seleccionar los criterios ${num}.x`),
            h('span', { title: comp ? comp.texto : '' }, `Criterio ${num}`,
              h('span', { class: 'nota' }, ` · competencia específica ${num}`)),
            botonCopiar(() => textoCriterioCompleto(n, num, lista), `⧉ Copiar criterio ${num} completo`,
              `Copia «${num}.» con su competencia y todos los criterios ${num}.1, ${num}.2…`)),
          h('ul', { class: 'lista' }, lista.map(([c, k]) => elemento(n, `crit-${k}`,
            [h('span', { class: 'cod' }, c.codigo), marcar(c.texto)], `${c.codigo} ${c.texto}`))));
        return grupo;
      }));

    // Contenidos: un grupo por bloque; un contenido se copia y se selecciona con sus subapartados
    const secCont = seccion(SECCIONES[2], nContenidos, () => textoContenidos(n),
      n.contenidos.map((b, bi) => {
        const grupo = h('div', { class: 'grupo-bloque' });
        grupo.append(
          h('h4', { id: `bloque-${bi}` },
            tickGrupo(() => grupo, 'Seleccionar todo el bloque'),
            h('span', null, marcar(b.titulo)),
            botonCopiar(() => textoBloque(b), '⧉ Copiar bloque')),
          h('ul', { class: 'lista' }, b.items.map((it, ii) => {
            const hijos = hijosContenido(b, ii);
            const texto = [it, ...hijos.map((k) => b.items[k])].map((x) => lineaContenido(x, it.nivel)).join('\n');
            const li = elemento(n, `cont-${bi}-${ii}`, marcar(it.texto), texto, it.encabezado ? 'enc' : null,
              hijos.length ? `Copiar con sus ${hijos.length} subapartados` : 'Copiar');
            li.style.paddingLeft = `${(it.nivel || 0) * 1.4}rem`;
            return li;
          })));
        return grupo;
      }));

    vista.replaceChildren(
      h('div', { class: 'migas' }, ETAPAS[m.etapa].nombre, ' › ', m.nombre),
      h('h2', { class: 'titulo-nivel' }, m.nombre),
      h('p', { class: 'subtitulo' }, n.etiqueta, ' · ', ETAPAS[m.etapa].norma),
      h('div', { class: 'acciones' },
        m.niveles.length > 1 ? m.niveles.map((o) => h('a', { class: `chip${o === n ? ' activo' : ''}`, href: hashDe({ n: o.id, q }) }, o.etiqueta)) : null,
        botonCopiar(() => textoNivel(n), '⧉ Copiar todo'),
        h('button', { class: 'boton', type: 'button', onclick: () => window.print() }, '🖨 Imprimir'),
        q ? h('a', { class: 'boton', href: hashDe({ q }) }, '← Volver a los resultados') : null),
      pestanasSecciones([competencias.length, n.criterios.length, nContenidos]),
      secComp, secCrit, secCont);
    refrescarSeleccion();

    // Salta al elemento indicado (desde la búsqueda) o al principio
    const destino = ancla && document.getElementById(ancla);
    if (destino) {
      destino.scrollIntoView({ block: 'center' });
      destino.classList.add('destello');
    } else {
      window.scrollTo(0, 0);
    }
    actualizarPestanaActiva();
  }

  // Dibuja la vista que corresponde a la dirección actual
  let ultimaBusqueda = null;
  function pintar() {
    const { n, a, q } = leerRuta();
    if (campo.value !== q && document.activeElement !== campo) campo.value = q;
    const nivel = n && NIVELES.get(n);
    if (nivel) {
      pintarNivel(nivel, a, q);
      document.title = `${nivel.materia.nombre} · ${nivel.etiqueta} · Currículo`;
    } else if (q.trim().length >= 2) {
      if (q !== ultimaBusqueda) limiteResultados = PASO_RESULTADOS;
      ultimaBusqueda = q;
      pintarResultados(q);
      document.title = `«${q.trim()}» · Currículo`;
    } else if (fEtapa.value) {
      pintarListado(fEtapa.value, +fCurso.value);
      document.title = `${fCurso.value ? nombreCurso(fEtapa.value, +fCurso.value) : ETAPAS[fEtapa.value].nombre} · Currículo`;
    } else {
      pintarPortada();
      document.title = 'Currículo · Comunidad de Madrid';
    }
    marcarEnArbol(nivel ? nivel.id : '');
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  // Búsqueda al vuelo (con una pequeña espera para no buscar en cada pulsación)
  let temporizadorBusqueda = null;
  campo.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => irA({ q: campo.value }, true), 150);
  });

  // Cambiar un menú filtra el índice y muestra los resultados de la búsqueda (si la hay)
  // o las asignaturas de la etapa y el curso elegidos
  function alCambiarFiltro() {
    aplicarFiltroArbol();
    const q = campo.value;
    irA(q.trim().length >= 2 ? { q } : {}, false);
  }
  fEtapa.addEventListener('change', () => { rellenarCursos(); alCambiarFiltro(); });
  fCurso.addEventListener('change', alCambiarFiltro);
  // Las casillas de tipo solo afectan a la búsqueda
  Object.values(casillas).forEach((c) => c.addEventListener('change', () => {
    const q = campo.value;
    if (q.trim().length >= 2) irA({ q }, true);
  }));
  // Quitar los filtros de etapa y curso
  document.getElementById('f-quitar').addEventListener('click', () => {
    fEtapa.value = '';
    rellenarCursos();
    alCambiarFiltro();
  });

  // Atajos de teclado: «/» va al buscador y «Esc» lo borra
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && document.activeElement !== campo && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      ev.preventDefault();
      campo.focus();
      campo.select();
    } else if (ev.key === 'Escape' && document.activeElement === campo) {
      campo.value = '';
      irA({}, true);
    }
  });

  // Pestañas de los árboles y botón del índice en el móvil
  document.querySelectorAll('.pestanas button').forEach((b) => b.addEventListener('click', () => elegirArbol(b.dataset.arbol)));
  document.getElementById('btn-indice').addEventListener('click', () => document.body.classList.toggle('indice-abierto'));

  // Barra de la selección: copiar todo lo marcado o vaciar la selección
  document.getElementById('sel-copiar').addEventListener('click', () => copiar(textoSeleccion(), `Copiados ${SELECCION.size} elementos`));
  document.getElementById('sel-quitar').addEventListener('click', () => { SELECCION.clear(); alCambiarSeleccion(); });

  // La pestaña activa sigue a la sección que se está leyendo (como mucho una vez por fotograma)
  let pendiente = false;
  window.addEventListener('scroll', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; actualizarPestanaActiva(); });
  }, { passive: true });

  // Navegación con Atrás/Adelante o con enlaces
  window.addEventListener('hashchange', pintar);

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------

  cargarSeleccion();
  construirArbolMaterias();
  construirArbolCursos();
  // Menús coherentes aunque el navegador recuerde valores de otra visita
  rellenarCursos();
  aplicarFiltroArbol();
  elegirArbol(leerPreferencia('arbol', 'materias'));
  pintar();
})();
