const MAX_SIZE_BYTES = 50 * 1024 * 1024; // Batas 50 MB
const DOC_ORDER = ['invoice', 'email', 'report'];
const DOC_LABELS = {
  invoice: 'Invoice',
  email: 'Email',
  report: 'Report'
};

let groupedDealers = [];
let currentFilter = 'all';
let searchQuery = '';

// Referensi DOM
const dropZone = document.getElementById('dropZone');
const folderInput = document.getElementById('folderInput');
const filesInput = document.getElementById('filesInput');
const btnSelectFolder = document.getElementById('btnSelectFolder');
const btnSelectFiles = document.getElementById('btnSelectFiles');
const btnClear = document.getElementById('btnClear');
const btnMerge = document.getElementById('btnMerge');
const chkTagIncompleteFilename = document.getElementById('chkTagIncompleteFilename');
const searchDealerInput = document.getElementById('searchDealerInput');

const statsGrid = document.getElementById('statsGrid');
const previewCard = document.getElementById('previewCard');
const logCard = document.getElementById('logCard');
const dealerTableBody = document.getElementById('dealerTableBody');
const logBox = document.getElementById('logBox');

const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const progressPercent = document.getElementById('progressPercent');

// Event Listeners
btnSelectFolder.addEventListener('click', () => folderInput.click());
btnSelectFiles.addEventListener('click', () => filesInput.click());
btnClear.addEventListener('click', resetApp);
btnMerge.addEventListener('click', processAndDownloadZip);

chkTagIncompleteFilename.addEventListener('change', () => {
  updateOutputFilenames();
  renderTable();
});

searchDealerInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderTable();
});

folderInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
filesInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
});

document.querySelectorAll('.pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    renderTable();
  });
});

function addLog(message, type = 'normal') {
  logCard.classList.remove('hidden');
  const line = document.createElement('div');
  if (type === 'warn') line.className = 'log-warn';
  if (type === 'err') line.className = 'log-err';
  if (type === 'ok') line.className = 'log-ok';
  line.textContent = `[${new Date().toLocaleTimeString('id-ID')}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function resetApp() {
  groupedDealers = [];
  searchQuery = '';
  searchDealerInput.value = '';
  folderInput.value = '';
  filesInput.value = '';
  dealerTableBody.innerHTML = '';
  logBox.innerHTML = '';
  statsGrid.classList.add('hidden');
  previewCard.classList.add('hidden');
  logCard.classList.add('hidden');
  progressWrap.style.display = 'none';
  btnMerge.disabled = true;
  btnClear.disabled = true;
}

/**
 * Deteksi 2 Entitas Unik secara Independen terhadap Urutan Penamaan:
 * 1. Jenis File: invoice (inv), email (e-mail/mail), report (laporan/lap)
 * 2. Kode Dealer: deretan digit unik dealer (misal 100123), mengabaikan pola tanggal/tahun
 */
function extractEntities(file) {
  const fileNameNoExt = file.name.replace(/\.pdf$/i, '');
  const normalized = fileNameNoExt.toLowerCase();

  // 1. Deteksi Jenis File (posisi bebas: depan, tengah, maupun belakang nama file)
  let docType = null;
  if (/(?:^|[^a-z])(invoice|inv)(?:[^a-z]|$)/i.test(normalized)) {
    docType = 'invoice';
  } else if (/(?:^|[^a-z])(e-?mail|mail)(?:[^a-z]|$)/i.test(normalized)) {
    docType = 'email';
  } else if (/(?:^|[^a-z])(report|laporan|lap)(?:[^a-z]|$)/i.test(normalized)) {
    docType = 'report';
  }

  // 2. Deteksi Kode Dealer
  let dealerCode = null;
  const numericTokens = fileNameNoExt.match(/\d{4,10}/g) || [];

  // Filter angka yang menyerupai format tanggal YYYYMMDD (misal 20261119) atau YYYYMM (misal 202611)
  const nonDateTokens = numericTokens.filter((num) => {
    const isFullDate = num.length === 8 && /^20[23]\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(num);
    const isYearMonth = num.length === 6 && /^20[23]\d(0[1-9]|1[0-2])$/.test(num);
    return !isFullDate && !isYearMonth;
  });

  const candidateTokens = nonDateTokens.length > 0 ? nonDateTokens : numericTokens;

  // Prioritas kode dealer 5-8 digit (standar kode dealer)
  const standardCode = candidateTokens.find((num) => num.length >= 5 && num.length <= 8);
  if (standardCode) {
    dealerCode = standardCode;
  } else {
    // Fallback kode 4 digit yang bukan tahun 2020-2035
    const nonYear4Digit = candidateTokens.find((num) => {
      const n = parseInt(num, 10);
      return num.length === 4 && (n < 2020 || n > 2035);
    });
    if (nonYear4Digit) {
      dealerCode = nonYear4Digit;
    } else if (candidateTokens.length > 0) {
      dealerCode = candidateTokens[0];
    }
  }

  // Fallback terakhir: cek nama folder induk jika kode dealer tidak tertulis di nama file
  if (!dealerCode && file.webkitRelativePath) {
    const parts = file.webkitRelativePath.split('/');
    if (parts.length >= 2) {
      const parentFolder = parts[parts.length - 2];
      const folderNums = parentFolder.match(/\d{4,8}/g);
      if (folderNums && folderNums.length > 0) {
        dealerCode = folderNums[0];
      }
    }
  }

  return { dealerCode, docType };
}

function handleFiles(allFiles) {
  resetApp();

  const pdfFiles = allFiles.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 0) {
    alert('Tidak ada file PDF yang ditemukan.');
    return;
  }

  const totalBytes = pdfFiles.reduce((acc, f) => acc + f.size, 0);
  if (totalBytes > MAX_SIZE_BYTES) {
    alert(`Total ukuran PDF (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) melebihi batas maksimal 50 MB.`);
    return;
  }

  const dealerMap = new Map();
  let ignoredCount = 0;

  pdfFiles.forEach((file) => {
    const { dealerCode, docType } = extractEntities(file);

    if (!dealerCode || !docType) {
      ignoredCount++;
      const missingEntities = [];
      if (!dealerCode) missingEntities.push('Kode Dealer');
      if (!docType) missingEntities.push('Jenis File (Invoice/Email/Report)');
      addLog(`Diabaikan: "${file.name}" -> Entitas tidak terbaca (${missingEntities.join(' & ')})`, 'err');
      return;
    }

    if (!dealerMap.has(dealerCode)) {
      dealerMap.set(dealerCode, {
        dealerCode,
        docs: {
          invoice: [],
          email: [],
          report: []
        },
        isComplete: false,
        missingTypes: [],
        keterangan: '',
        outputFilename: ''
      });
    }

    dealerMap.get(dealerCode).docs[docType].push(file);
  });

  // Urutkan kode dealer secara numerik
  groupedDealers = Array.from(dealerMap.values()).sort((a, b) =>
    a.dealerCode.localeCompare(b.dealerCode, undefined, { numeric: true })
  );

  // Susun status kelengkapan dan keterangan untuk setiap kode dealer
  groupedDealers.forEach((group) => {
    const missing = [];
    const notes = [];

    DOC_ORDER.forEach((type) => {
      // Urutkan file dalam kategori yang sama berdasarkan nama file
      group.docs[type].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const count = group.docs[type].length;
      if (count === 0) {
        missing.push(DOC_LABELS[type]);
      } else if (count > 1) {
        notes.push(`${count}x ${DOC_LABELS[type]}`);
      }
    });

    group.missingTypes = missing;
    group.isComplete = missing.length === 0;

    if (group.isComplete) {
      group.keterangan = notes.length
        ? `Lengkap (3/3) • Catatan: ${notes.join(', ')}`
        : 'Lengkap (Invoice, Email, Report)';
    } else {
      const foundLabels = DOC_ORDER
        .filter((t) => group.docs[t].length > 0)
        .map((t) => DOC_LABELS[t]);

      group.keterangan = `Tidak Lengkap — Kurang: ${missing.join(', ')} (Ada: ${foundLabels.join(', ')})`;
      if (notes.length) {
        group.keterangan += ` • ${notes.join(', ')}`;
      }
      addLog(`Dealer ${group.dealerCode}: ${group.keterangan}`, 'warn');
    }
  });

  updateOutputFilenames();

  // Perbarui statistik
  const completeCount = groupedDealers.filter((d) => d.isComplete).length;
  const incompleteCount = groupedDealers.length - completeCount;

  document.getElementById('statDealers').textContent = groupedDealers.length;
  document.getElementById('statComplete').textContent = completeCount;
  document.getElementById('statIncomplete').textContent = incompleteCount;
  document.getElementById('statSize').textContent = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;

  statsGrid.classList.remove('hidden');
  previewCard.classList.remove('hidden');
  btnClear.disabled = false;
  btnMerge.disabled = groupedDealers.length === 0;

  addLog(
    `Pemindaian selesai (${pdfFiles.length} PDF): ${groupedDealers.length} Kode Dealer terdeteksi (${completeCount} lengkap, ${incompleteCount} tidak lengkap, ${ignoredCount} diabaikan).`,
    'ok'
  );

  renderTable();
}

function updateOutputFilenames() {
  const tagIncomplete = chkTagIncompleteFilename.checked;
  groupedDealers.forEach((group) => {
    if (!group.isComplete && tagIncomplete) {
      group.outputFilename = `${group.dealerCode}_Kurang_${group.missingTypes.join('_')}.pdf`;
    } else {
      group.outputFilename = `${group.dealerCode}.pdf`;
    }
  });
}

function renderTable() {
  dealerTableBody.innerHTML = '';

  const filtered = groupedDealers.filter((d) => {
    const matchesTab =
      currentFilter === 'all' ||
      (currentFilter === 'complete' && d.isComplete) ||
      (currentFilter === 'incomplete' && !d.isComplete);

    const matchesSearch =
      !searchQuery || d.dealerCode.toLowerCase().includes(searchQuery);

    return matchesTab && matchesSearch;
  });

  if (filtered.length === 0) {
    dealerTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #94a3b8; padding: 18px;">
          Tidak ada data Kode Dealer yang sesuai dengan filter.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((group) => {
    const tr = document.createElement('tr');

    const formatCell = (filesArr) => {
      if (filesArr.length === 0) {
        return `<span class="doc-missing">Tidak ada</span>`;
      }
      return filesArr
        .map((f) => `<div class="doc-found">&#10003; ${escapeHtml(f.name)}</div>`)
        .join('');
    };

    const badgeClass = group.isComplete ? 'status-complete' : 'status-incomplete';

    tr.innerHTML = `
      <td><span class="code-tag">${escapeHtml(group.dealerCode)}</span></td>
      <td>${formatCell(group.docs.invoice)}</td>
      <td>${formatCell(group.docs.email)}</td>
      <td>${formatCell(group.docs.report)}</td>
      <td><span class="status-badge ${badgeClass}">${escapeHtml(group.keterangan)}</span></td>
      <td><code>${escapeHtml(group.outputFilename)}</code></td>
    `;

    dealerTableBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function processAndDownloadZip() {
  if (groupedDealers.length === 0) return;

  btnMerge.disabled = true;
  btnSelectFolder.disabled = true;
  btnSelectFiles.disabled = true;
  progressWrap.style.display = 'block';

  const zip = new JSZip();
  const summaryLines = [
    'KODE DEALER;FILE OUTPUT;STATUS;KETERANGAN;INVOICE;EMAIL;REPORT'
  ];

  try {
    for (let i = 0; i < groupedDealers.length; i++) {
      const group = groupedDealers[i];
      const percent = Math.round(((i + 1) / groupedDealers.length) * 100);
      progressFill.style.width = `${percent}%`;
      progressLabel.textContent = `Menggabungkan Kode Dealer ${group.dealerCode} (${i + 1}/${groupedDealers.length})...`;
      progressPercent.textContent = `${percent}%`;

      const mergedPdf = await PDFLib.PDFDocument.create();
      let mergedPageCount = 0;

      // Gabungkan dokumen yang tersedia sesuai urutan: Invoice -> Email -> Report
      for (const type of DOC_ORDER) {
        for (const file of group.docs[type]) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const srcPdf = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            mergedPageCount += copiedPages.length;
          } catch (fileErr) {
            addLog(`Gagal membaca file "${file.name}" pada dealer ${group.dealerCode}: ${fileErr.message}`, 'err');
          }
        }
      }

      if (mergedPageCount > 0) {
        const mergedBytes = await mergedPdf.save();
        zip.file(group.outputFilename, mergedBytes);

        summaryLines.push([
          group.dealerCode,
          group.outputFilename,
          group.isComplete ? 'LENGKAP' : 'TIDAK LENGKAP',
          group.keterangan,
          group.docs.invoice.map((f) => f.name).join(' | ') || '-',
          group.docs.email.map((f) => f.name).join(' | ') || '-',
          group.docs.report.map((f) => f.name).join(' | ') || '-'
        ].join(';'));

        addLog(
          `Berhasil digabung: ${group.outputFilename} (${mergedPageCount} halaman) -> ${group.keterangan}`,
          group.isComplete ? 'ok' : 'warn'
        );
      } else {
        addLog(`Dealer ${group.dealerCode} dilewati karena tidak ada halaman PDF yang valid.`, 'err');
      }
    }

    // Sertakan file rekap CSV di dalam ZIP sebagai laporan keterangan
    zip.file('_Rekap_Keterangan_Gabung.csv', '\uFEFF' + summaryLines.join('\n'));

    progressLabel.textContent = 'Membuat arsip ZIP...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const today = new Date().toISOString().slice(0, 10);
    const downloadUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Combine_PDF_Dealer_${today}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    progressLabel.textContent = 'Selesai! Arsip ZIP otomatis terunduh.';
    addLog(`Selesai! File Combine_PDF_Dealer_${today}.zip berhasil diunduh.`, 'ok');
  } catch (err) {
    console.error(err);
    addLog(`Terjadi kesalahan saat memproses PDF: ${err.message}`, 'err');
    alert(`Gagal menggabungkan PDF: ${err.message}`);
  } finally {
    btnMerge.disabled = false;
    btnSelectFolder.disabled = false;
    btnSelectFiles.disabled = false;
  }
}
