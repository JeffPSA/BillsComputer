export type DeckTextFormat = 'PTCGL' | 'LIMITLESS' | 'TCGPLAYER';

const groups = [
  { key: 'Pokémon', label: 'Pokémon' },
  { key: 'Trainer', label: 'Trainer' },
  { key: 'Energy', label: 'Energy' },
] as const;

function requirementRows(deck: any) {
  return (deck.requirements || []).flatMap((row: any) => {
    const requiredQuantity = Number(row.requirement?.quantity || 0);
    const physicalRows = (row.physicalPrintings || [])
      .filter((physical: any) => physical?.printing && Number(physical.quantity) > 0)
      .map((physical: any) => ({
        quantity: Number(physical.quantity),
        mode: 'SPECIFIC_PRINTING',
        card: row.card || {},
        printing: physical.printing,
        source: 'PHYSICAL_ALLOCATION',
      }));
    const physicallyAssigned = physicalRows.reduce((sum: number, physical: any) => sum + physical.quantity, 0);
    const unassignedRemainder = Math.max(0, requiredQuantity - physicallyAssigned);

    if (unassignedRemainder === 0) return physicalRows;

    return [
      ...physicalRows,
      {
        quantity: unassignedRemainder,
        mode: row.requirement?.requirementMode || 'ANY_PRINTING',
        card: row.card || {},
        printing: row.printing || row.card?.printings?.[0],
        source: 'UNASSIGNED_REQUIREMENT',
      },
    ];
  });
}

function cardLine(row: any, format: DeckTextFormat): string {
  const name = row.card?.name || 'Unknown Card';
  const setCode = row.printing?.setCode;
  const cardNumber = row.printing?.cardNumber;

  if (format === 'TCGPLAYER') {
    return row.mode === 'SPECIFIC_PRINTING' && setCode && cardNumber
      ? `${row.quantity} ${name} [${setCode}] ${cardNumber}`
      : `${row.quantity} ${name}`;
  }

  return setCode && cardNumber
    ? `${row.quantity} ${name} ${setCode} ${cardNumber}`
    : `${row.quantity} ${name}`;
}

export function buildDeckText(deck: any, format: DeckTextFormat): string {
  const rows = requirementRows(deck);

  if (format === 'LIMITLESS' || format === 'TCGPLAYER') {
    return rows.map((row: any) => cardLine(row, format)).join('\n');
  }

  const sections = groups.map(({ key, label }) => {
    const sectionRows = rows.filter((row: any) => row.card?.supertype === key);
    const count = sectionRows.reduce((sum: number, row: any) => sum + row.quantity, 0);
    return `${label}: ${count}\n${sectionRows.map((row: any) => cardLine(row, format)).join('\n')}`;
  });
  const total = rows.reduce((sum: number, row: any) => sum + row.quantity, 0);
  return `${sections.join('\n\n')}\n\nTotal Cards: ${total}`;
}

export function downloadDeckText(deck: any, format: DeckTextFormat): void {
  const text = buildDeckText(deck, format);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = String(deck.name || 'deck').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  anchor.href = url;
  anchor.download = `${safeName || 'deck'}-${format.toLowerCase()}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface DeckListPlayerDetails {
  playerName: string;
  playerId: string;
  dateOfBirth: string;
  ageDivision: '' | 'Junior' | 'Senior' | 'Masters';
}

export function printDeckList(deck: any, player: DeckListPlayerDetails): boolean {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) return false;

  const rows = requirementRows(deck);
  const total = rows.reduce((sum: number, row: any) => sum + row.quantity, 0);
  const renderSection = (supertype: string, label: string) => {
    const sectionRows = rows.filter((row: any) => row.card?.supertype === supertype);
    const count = sectionRows.reduce((sum: number, row: any) => sum + row.quantity, 0);
    const body = sectionRows.map((row: any) => `
      <tr>
        <td>${row.quantity}</td>
        <td>${escapeHtml(row.card?.name || 'Unknown Card')}</td>
        <td>${escapeHtml(row.printing?.setCode || '')}</td>
        <td>${escapeHtml(row.printing?.cardNumber || '')}</td>
        <td>${escapeHtml(row.printing?.regulationMark || '')}</td>
      </tr>`).join('');
    return `
      <section>
        <h2>${escapeHtml(label)} <span>${count}</span></h2>
        <table>
          <thead><tr><th>Qty</th><th>Name</th><th>Set</th><th>Num</th><th>Reg</th></tr></thead>
          <tbody>${body || '<tr><td colspan="5" class="empty">No cards</td></tr>'}</tbody>
        </table>
      </section>`;
  };

  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeHtml(deck.name)} Deck List</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #171717; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
      header { display: flex; align-items: end; justify-content: space-between; border-bottom: 3px solid #252525; padding-bottom: 5px; margin-bottom: 8px; }
      h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
      .meta { color: #555; font-weight: 700; }
      .layout { display: grid; grid-template-columns: 31% 1fr; gap: 10mm; align-items: start; }
      .player { border: 1px solid #d1d5db; padding: 6mm; }
      .player h2 { margin: -6mm -6mm 5mm; padding: 3mm 6mm; background: #d1d5db; font-size: 12px; text-transform: uppercase; }
      .field { margin-bottom: 5mm; }
      .field label { display: block; font-weight: 700; margin-bottom: 2mm; }
      .line { min-height: 6mm; border-bottom: 1px solid #222; font-size: 12px; }
      .divisions { display: grid; gap: 2mm; }
      .division { display: flex; gap: 2mm; align-items: center; }
      .radio { width: 3.5mm; height: 3.5mm; border: 1px solid #777; border-radius: 50%; display: inline-block; }
      .radio.active { box-shadow: inset 0 0 0 1mm white; background: #222; }
      .sections { display: grid; gap: 4mm; }
      section h2 { display: flex; justify-content: space-between; margin: 0; padding: 2mm 3mm; background: #d1d5db; font-size: 11px; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th { background: #252525; color: white; text-transform: uppercase; text-align: left; }
      th, td { border: 1px solid #d9dde3; padding: 1.4mm 2mm; line-height: 1.15; }
      th:nth-child(1), td:nth-child(1) { width: 9%; }
      th:nth-child(3), td:nth-child(3) { width: 13%; }
      th:nth-child(4), td:nth-child(4) { width: 11%; }
      th:nth-child(5), td:nth-child(5) { width: 9%; }
      .empty { color: #888; text-align: center; font-style: italic; }
      footer { margin-top: 4mm; text-align: right; font-weight: 700; font-size: 11px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body>
      <header><div><h1>${escapeHtml(deck.name)}</h1><div class="meta">${escapeHtml(deck.version)} · ${escapeHtml(deck.format)}</div></div><div class="meta">Deck List · ${total} cards</div></header>
      <div class="layout">
        <aside class="player">
          <h2>Player Information</h2>
          <div class="field"><label>Player Name</label><div class="line">${escapeHtml(player.playerName)}</div></div>
          <div class="field"><label>Player ID</label><div class="line">${escapeHtml(player.playerId)}</div></div>
          <div class="field"><label>Date of Birth</label><div class="line">${escapeHtml(player.dateOfBirth)}</div></div>
          <div class="field"><label>Age Division</label><div class="divisions">
            ${['Junior', 'Senior', 'Masters'].map((division) => `<div class="division"><span class="radio ${player.ageDivision === division ? 'active' : ''}"></span>${division} Division</div>`).join('')}
          </div></div>
        </aside>
        <main class="sections">
          ${renderSection('Pokémon', 'Pokémon')}
          ${renderSection('Trainer', 'Trainer')}
          ${renderSection('Energy', 'Energy')}
        </main>
      </div>
      <footer>Total Cards: ${total}</footer>
      <script>window.addEventListener('load', () => { window.focus(); window.print(); });<\/script>
    </body></html>`);
  printWindow.document.close();
  return true;
}
