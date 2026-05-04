import * as XLSX from 'xlsx';

export function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [];

  rows.push(['SCOUTED TEAM VS/@ OTHER TEAM', null, null]);
  rows.push(['DATE: ', null, null]);

  const quarters = ['1Q', '2Q', '3Q', '4Q', 'OT'];
  for (const q of quarters) {
    rows.push(['TYPE', q, 'CALL']);
    for (let i = 0; i < 22; i++) {
      rows.push([null, null, null]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 6 }, { wch: 32 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Play Calls');
  XLSX.writeFile(wb, 'PlayCall_Template.xlsx');
}
