// neufox's Rec Editor: interface languages. English strings are the keys; `{0}`, `{1}`… are filled in by t().
'use strict';

const I18N_LANGS = { en: 'EN', pt: 'PT' };

const I18N = {
  pt: {
    // ── page ──
    "neufox's Rec Editor": "neufox's Rec Editor",
    'Active recording': 'Gravação ativa',
    'Language': 'Idioma',
    'Open .rec or .csv files (or drop them anywhere)': 'Abrir arquivos .rec ou .csv (ou arraste para qualquer lugar)',
    'Open': 'Abrir',
    'Open the bundled demo recordings': 'Abrir as gravações de demonstração',
    'Samples': 'Exemplos',
    'Save': 'Salvar',
    'as…': 'como…',
    'Active as .rec': 'Ativa como .rec',
    'Active as .csv': 'Ativa como .csv',
    'Every open recording (.rec)': 'Todas as gravações abertas (.rec)',
    'Undo (Ctrl+Z)': 'Desfazer (Ctrl+Z)',
    'Redo (Ctrl+Shift+Z)': 'Refazer (Ctrl+Shift+Z)',
    'Follow': 'Seguir',
    'Points': 'Pontos',
    'Fit path': 'Ajustar ao trajeto',
    'Drop .rec files here': 'Solte arquivos .rec aqui',
    'SA-MP / open.mp NPC recordings: driver and on-foot. Everything stays in your browser.': 'Gravações de NPC do SA-MP / open.mp: motorista e a pé. Tudo fica no seu navegador.',
    'Open files': 'Abrir arquivos',
    'Load samples': 'Carregar exemplos',
    'Frame': 'Frame',
    'Edit': 'Editar',
    'Tools': 'Ferramentas',
    'Layers': 'Camadas',
    'Issues': 'Problemas',
    'Previous frame (←)': 'Frame anterior (←)',
    'Next frame (→)': 'Próximo frame (→)',
    'x, y, z, angle of this frame': 'x, y, z e ângulo deste frame',
    'Copy x, y, z, angle': 'Copiar x, y, z, ângulo',
    'Copy NPC_SetPos': 'Copiar NPC_SetPos',
    'Selection': 'Seleção',
    'Nothing selected': 'Nada selecionado',
    'Set in': 'Marcar início',
    'Set out': 'Marcar fim',
    'All': 'Tudo',
    'Clear': 'Limpar',
    'Shift+drag the timeline or Shift+click the path to select.': 'Shift+arrastar na linha do tempo ou Shift+clique no trajeto para selecionar.',
    'Cut': 'Cortar',
    'Keep only the selection': 'Manter só a seleção',
    'Trim to selection': 'Cortar para a seleção',
    'Delete': 'Excluir',
    'Duplicate': 'Duplicar',
    'Time': 'Tempo',
    'Hold at current frame': 'Parar no frame atual',
    'Insert': 'Inserir',
    'Retime selection ×': 'Reajustar tempo da seleção ×',
    'Apply': 'Aplicar',
    'Selection duration': 'Duração da seleção',
    'Set': 'Definir',
    'Retiming scales velocity (and train speed) to match.': 'Reajustar o tempo também ajusta a velocidade (e a velocidade do trem).',
    'Path': 'Trajeto',
    'Smooth radius / passes': 'Raio / passadas da suavização',
    'Smooth': 'Suavizar',
    'Recompute velocity after smoothing': 'Recalcular a velocidade depois de suavizar',
    'Recompute velocity from path': 'Recalcular a velocidade pelo trajeto',
    'Drag falloff': 'Alcance ao arrastar',
    'm along the path': 'm ao longo do trajeto',
    'Drag the orange handle on the map to move the current frame; neighbours follow with the falloff.': 'Arraste a alça laranja no mapa para mover o frame atual; os vizinhos acompanham dentro do alcance.',
    'Set a field on the selection': 'Definir um campo na seleção',
    'Applies to': 'Aplica-se a',
    'Whole recording': 'Gravação inteira',
    'Move': 'Mover',
    'Offset': 'Deslocar',
    'Translate so the current frame lands here': 'Desloca para o frame atual cair neste ponto',
    'Move to': 'Mover para',
    '"Move to" puts the current frame on that point; the rest follows. Empty boxes keep that axis.': '"Mover para" coloca o frame atual nesse ponto; o resto acompanha. Caixas vazias mantêm aquele eixo.',
    'Rotate': 'Girar',
    'around centre': 'em torno do centro',
    'around current frame': 'em torno do frame atual',
    'around first frame': 'em torno do primeiro frame',
    'Reverse': 'Inverter',
    'Turn around (face the new direction)': 'Dar meia-volta (virar para a nova direção)',
    'Reverse playback': 'Inverter reprodução',
    'Timing': 'Tempo',
    'Resample every': 'Reamostrar a cada',
    'Resample': 'Reamostrar',
    'Fix timestamps, start at': 'Corrigir tempos, começar em',
    'keep': 'manter',
    'Fix': 'Corrigir',
    'Join': 'Juntar',
    'gap ms': 'interv. ms',
    'Append': 'Anexar',
    'Skip its first frame (when it starts where this ends)': 'Pular o primeiro frame dela (quando começa onde esta termina)',
    'First frame (Home)': 'Primeiro frame (Home)',
    'Play / pause (Space)': 'Reproduzir / pausar (Espaço)',
    'Last frame (End)': 'Último frame (End)',
    'Playback speed': 'Velocidade de reprodução',
    'Graph': 'Gráfico',
    'Speed': 'Velocidade',
    'Height': 'Altura',
    'Frame gap': 'Intervalo entre frames',
    'Show the whole recording': 'Mostrar a gravação inteira',
    'Fit': 'Ajustar',
    'Drop to open': 'Solte para abrir',
    'START': 'INÍCIO',
    'END': 'FIM',

    // ── runtime ──
    'Open a recording first': 'Abra uma gravação primeiro',
    'Nothing to undo': 'Nada para desfazer',
    'Nothing to redo': 'Nada para refazer',
    'Undid: {0}': 'Desfeito: {0}',
    'Redid: {0}': 'Refeito: {0}',
    'Opened {0}: {1} frames': '{0} aberto: {1} frames',
    'Opened {0} recordings': '{0} gravações abertas',
    'No samples bundled': 'Nenhum exemplo incluído',
    'Close {0} without downloading your changes?': 'Fechar {0} sem baixar suas alterações?',
    '{0} has {1} error(s) (see Issues). Download anyway?': '{0} tem {1} erro(s) (veja Problemas). Baixar mesmo assim?',
    'selection': 'seleção',
    'No recording open.': 'Nenhuma gravação aberta.',
    'No recordings open.': 'Nenhuma gravação aberta.',
    'Since start (s)': 'Desde o início (s)',
    'Gap (ms)': 'Intervalo (ms)',
    'Speed (km/h)': 'Velocidade (km/h)',
    'Apply this value to the whole selection': 'Aplicar este valor à seleção inteira',
    'Select frames first (Edit tab or Shift+drag the timeline)': 'Selecione frames primeiro (aba Editar ou Shift+arrastar a linha do tempo)',
    'Select frames first: Set in / Set out, or Shift+drag the timeline': 'Selecione frames primeiro: Marcar início / Marcar fim, ou Shift+arrastar a linha do tempo',
    'Type': 'Tipo',
    'Duration': 'Duração',
    'Distance': 'Distância',
    'Max speed': 'Vel. máxima',
    'Avg speed': 'Vel. média',
    'driver': 'motorista',
    'driver · train': 'motorista · trem',
    'on foot': 'a pé',
    'frames {0}–{1} ({2}) · {3}': 'frames {0}–{1} ({2}) · {3}',
    '{0} · {1} frames · {2}': '{0} · {1} frames · {2}',
    'Show on map': 'Mostrar no mapa',
    'Move up': 'Subir',
    'Move down': 'Descer',
    'Download': 'Baixar',
    'Close': 'Fechar',
    'Joins (end → next start, Layers order)': 'Junções (fim → início da próxima, ordem das Camadas)',
    'No problems found.': 'Nenhum problema encontrado.',
    'Fix timestamps': 'Corrigir tempos',
    'open another recording': 'abra outra gravação',
    'Open another recording to append': 'Abra outra gravação para anexar',
    'Copied': 'Copiado',
    'Copy:': 'Copiar:',
    'error': 'erro',
    'warn': 'aviso',

    // edit labels (undo history)
    'Delete frames': 'Excluir frames',
    'Duplicate frames': 'Duplicar frames',
    'Insert hold': 'Inserir parada',
    'Retime': 'Reajustar tempo',
    'Recompute velocity': 'Recalcular velocidade',
    'Set field': 'Definir campo',
    'Move frame': 'Mover frame',
    'Rename': 'Renomear',
    'Set {0}': 'Definir {0}',
    'Set {0} on {1} frames': 'Definir {0} em {1} frames',
    'Append {0}': 'Anexar {0}',

    // edit results
    'Trimmed to {0} frames': 'Cortado para {0} frames',
    'Deleted {0} frames': '{0} frames excluídos',
    'Duplicated {0} frames': '{0} frames duplicados',
    'Holding {0} s ({1} frames)': 'Parado por {0} s ({1} frames)',
    'Retimed ×{0}': 'Tempo reajustado ×{0}',
    'Selection has no duration': 'A seleção não tem duração',
    'Selection now {0}': 'Seleção agora com {0}',
    'Smoothed frames {0}–{1}': 'Frames {0}–{1} suavizados',
    'Velocity recomputed for {0} frames': 'Velocidade recalculada em {0} frames',
    'Moved {0} frames': '{0} frames movidos',
    'Moved by {0}, {1}, {2}': 'Movido em {0}, {1}, {2}',
    'Rotated {0}°': 'Girado {0}°',
    'Reversed frames {0}–{1}': 'Frames {0}–{1} invertidos',
    'Resampled: {0} → {1} frames': 'Reamostrado: {0} → {1} frames',
    'Fixed {0} timestamps': '{0} tempos corrigidos',
    'Timestamps were already fine': 'Os tempos já estavam certos',
    'Appended {0} frames': '{0} frames anexados',

    // field labels / groups (rec.js FIELD_INFO)
    'Time (ms)': 'Tempo (ms)',
    'Position': 'Posição',
    'Rotation': 'Rotação',
    'Heading (°)': 'Direção (°)',
    'Quat W': 'Quat W', 'Quat X': 'Quat X', 'Quat Y': 'Quat Y', 'Quat Z': 'Quat Z',
    'Velocity': 'Velocidade',
    'Vel X': 'Vel X', 'Vel Y': 'Vel Y', 'Vel Z': 'Vel Z',
    'Vehicle': 'Veículo',
    'Train speed': 'Velocidade do trem',
    'Vehicle ID': 'ID do veículo',
    'Vehicle health': 'Vida do veículo',
    'Siren': 'Sirene',
    'Landing gear': 'Trem de pouso',
    'Trailer ID': 'ID do reboque',
    'Hydra/train raw': 'Hydra/trem (bruto)',
    'Keys': 'Teclas',
    'Left/right': 'Esquerda/direita',
    'Up/down': 'Cima/baixo',
    'Player': 'Jogador',
    'Health': 'Vida',
    'Armour': 'Colete',
    'Weapon + key': 'Arma + tecla',
    'Special action': 'Ação especial',
    'Animation': 'Animação',
    'Animation ID': 'ID da animação',
    'Animation flags': 'Flags da animação',
    'Surfing': 'Surfando',
    'Surf X': 'Surf X', 'Surf Y': 'Surf Y', 'Surf Z': 'Surf Z',
    'Surf ID': 'ID do surf',
    'Other': 'Outros',

    // validation (rec.js validate keys)
    '{0} trailing bytes ignored (truncated frame)': '{0} bytes no fim ignorados (frame incompleto)',
    'no frames': 'nenhum frame',
    'timestamp {0} not after {1}': 'tempo {0} não é depois de {1}',
    '{0} is not a number': '{0} não é um número',
    'jumps {0} m from the previous frame': 'salta {0} m em relação ao frame anterior',
    'rotation not normalised (|q| = {0})': 'rotação não normalizada (|q| = {0})',
    'position far outside the map': 'posição muito fora do mapa',
    'more issues not listed': 'mais problemas não listados',

    // rec.js errors
    'cannot delete every frame': 'não dá para excluir todos os frames',
    'factor must be > 0': 'o fator precisa ser > 0',
    'cannot join a driver recording with an on-foot one': 'não dá para juntar uma gravação de motorista com uma a pé',
  },
};

// Errors that carry a file name or value.
const I18N_PATTERNS = {
  pt: [
    [/^(.*): file too small$/, '$1: arquivo pequeno demais'],
    [/^(.*): unknown playback type (.*)$/, '$1: tipo de reprodução desconhecido $2'],
    [/^CSV is missing column "(.*)"$/, 'O CSV não tem a coluna "$1"'],
    [/^(.*): HTTP (\d+)$/, '$1: HTTP $2'],
  ],
};

let i18nLang = 'en';

function t(text, ...args) {
  let out = text;
  const dict = I18N[i18nLang];
  if (dict) {
    if (Object.prototype.hasOwnProperty.call(dict, text)) out = dict[text];
    else for (const [re, rep] of I18N_PATTERNS[i18nLang] || []) if (re.test(text)) { out = text.replace(re, rep); break; }
  }
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : out;
}

// Static page text: remember each node's English once, translate from that on every switch.
const i18nOriginal = new WeakMap();
const I18N_ATTRS = ['title', 'placeholder', 'aria-label'];

function translatePage(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && !n.parentElement.closest('script, style, svg, #map, [data-no-i18n]') && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!i18nOriginal.has(node)) i18nOriginal.set(node, node.nodeValue);
    const en = i18nOriginal.get(node);
    const key = en.trim();
    const lead = en.match(/^\s*/)[0], trail = en.match(/\s*$/)[0];
    node.nodeValue = lead + t(key) + trail;
  }
  for (const el of root.querySelectorAll(I18N_ATTRS.map(a => `[${a}]`).join(','))) {
    if (el.closest('#map, [data-no-i18n]')) continue;
    let saved = i18nOriginal.get(el);
    if (!saved) { saved = {}; for (const a of I18N_ATTRS) if (el.hasAttribute(a)) saved[a] = el.getAttribute(a); i18nOriginal.set(el, saved); }
    for (const [a, en] of Object.entries(saved)) el.setAttribute(a, t(en));
  }
}

function detectLanguage() {
  try {
    const saved = localStorage.getItem('rec-editor-lang');
    if (saved && I18N_LANGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  return (navigator.languages || [navigator.language || 'en']).some(l => /^pt\b/i.test(l)) ? 'pt' : 'en';
}

function setLanguage(lang, onChange) {
  i18nLang = I18N_LANGS[lang] ? lang : 'en';
  document.documentElement.lang = i18nLang === 'pt' ? 'pt-BR' : 'en';
  try { localStorage.setItem('rec-editor-lang', i18nLang); } catch { /* storage unavailable */ }
  translatePage();
  if (onChange) onChange();
}
