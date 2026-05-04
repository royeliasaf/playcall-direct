import * as XLSX from 'xlsx';

export function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();

  const rows = [
    ['PLAYCALL DIRECT — Coach Play Call Sheet'],
    [''],
    ['⚠  IMPORTANT: Fill in EVERY offensive play, in order. If there was no play call, write "NOTHING". Blank rows will break the matching.'],
    [''],
    ['Quarter', 'Game Clock', 'Type', 'Play Call'],
    ['', '', '', ''],
    ['1Q', '11:42', 'ATO', 'HAMMER'],
    ['1Q', '10:55', '', 'FLOPPY'],
    ['1Q', '10:18', '', 'NOTHING'],
    ['1Q', '9:33', 'SOB', 'DOUBLES'],
    ['1Q', '8:47', '', 'AMERICA'],
    ['1Q', '8:02', '', 'NOTHING'],
    ['1Q', '7:21', 'BOB', 'BLOB GO'],
    ['1Q', '6:44', 'ATO', 'IVERSON'],
    ['1Q', '5:58', '', 'NOTHING'],
    ['1Q', '5:12', '', 'HORNS'],
    [''],
    ['2Q', '11:45', '', ''],
    [''],
    ['— DELETE EXAMPLE ROWS ABOVE AND START FILLING FROM ROW 1 —'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 30 },
  ];

  // Style the warning row
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Play Calls');

  XLSX.writeFile(wb, 'PlayCall_Template.xlsx');
}
