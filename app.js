const MAX_SIZE_BYTES = 300 * 1024 * 1024; // Batas 300 MB
const STORAGE_KEY_ORDER = 'combine_pdf_dealer_doc_order_v1';
const DEFAULT_DOC_ORDER = ['invoice', 'email', 'report'];

const DOC_LABELS = {
  invoice: 'Invoice',
  email: 'Email',
  report: 'Report'
};

let docOrder = loadSavedOrder();
let draftDocOrder = [...docOrder];
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
const searchDealerInput = document.getElementById('searchDealerInput');

const activeOrderBadge = document.getElementById('activeOrderBadge');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnQuickEditOrder = document.getElementById('btnQuickEditOrder');
const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnCancelSettings = document.getElementById('btnCancelSettings');
const btnResetOrder = document.getElementById('btnResetOrder');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const orderListContainer = document.getElementById('orderListContainer');

const statsGrid = document.getElementById('statsGrid');
const previewCard = document.getElementById('previewCard');
const logCard = document.getElementById('logCard');
const dealerTableBody = document.getElementById('dealerTableBody');
const logBox = document.getElementById('logBox');

const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const progressPercent = document.getElementById('progressPercent');

// Inisialisasi tampilan urutan aktif saat halaman dimuat
syncOrderUI();

// Event Listeners Utama
btnSelectFolder.addEventListener('click', () => folderInput.click());
btnSelectFiles.addEventListener('click', () => filesInput.click());
btnClear.addEventListener('click', resetApp);
btnMerge.addEventListener('click', processAndDownloadZip);

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

// Event Listeners Modal Pengaturan Tata Letak
btnOpenSettings.addEventListener('click', openSettingsModal);
btnQuickEditOrder.addEventListener('click', openSettingsModal);
btnCloseSettings.addEventListener('click', closeSettingsModal);
btnCancelSettings.addEventListener('click', closeSettingsModal);

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

btnResetOrder.addEventListener('click', () => {
  draftDocOrder = [...DEFAULT_DOC_ORDER];
  renderOrderModalList();
});

btnSaveSettings.addEventListener('click', () => {
  docOrder = [...draftDocOrder];
  try {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(docOrder));
  } catch (_) {
    // Abaikan jika storage dibatasi
  }
  syncOrderUI();
  renderTable();
  closeSettingsModal();
  addLog(`Tata letak halaman diperbarui: ${formatOrderText(docOrder)}`, 'ok');
});

function loadSavedOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDER);
    if (!raw) return [...DEFAULT_DOC_ORDER];
    const parsed = JSON.parse(raw);
    const isValid =
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      DEFAULT_DOC_ORDER.every((item) => parsed.includes(item));
    return isValid ? parsed : [...DEFAULT_DOC_ORDER];
  } catch (_) {
    return [...DEFAULT_DOC_ORDER];
  }
}

function formatOrderText(orderArr) {
  return orderArr.map((key, idx) => `${idx + 1}. ${DOC_LABELS[key]}`).join(' → ');
}

function syncOrderUI() {
  activeOrderBadge.textContent = formatOrderText(docOrder);
  document.getElementById('colDoc1').textContent = `Hal. 1 • ${DOC_LABELS[docOrder[0]]}`;
  document.getElementById('colDoc2').textContent = `Hal. 2 • ${DOC_LABELS[docOrder[1]]}`;
  document.getElementById('colDoc3').textContent = `Hal. 3 • ${DOC_LABELS[docOrder[2]]}`;
}

function openSettingsModal() {
  draftDocOrder = [...docOrder];
  renderOrderModalList();
  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
}

function renderOrderModalList() {
  orderListContainer.innerHTML = '';

  draftDocOrder.forEach((docKey, index) => {
    const row = document.createElement('div');
    row.className = 'order-item';

    const optionsHtml = DEFAULT_DOC_ORDER.map(
      (key) => `<option value="${key}" ${key === docKey ? 'selected' : ''}>${DOC_LABELS[key]}</option>`
    ).join('');

    row.innerHTML = `
      <div class="order-item-left">
        <span class="order-num">${index + 1}</span>
        <select class="order-select" data-index="${index}" aria-label="Dokumen urutan ke-${index + 1}">
          ${optionsHtml}
        </select>
      </div>
      <div class="order-move-btns">
        <button type="button" class="btn-move" data-dir="-1" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Geser ke atas">&#9650;</button>
        <button type="button" class="btn-move" data-dir="1" data-index="${index}" ${index === draftDocOrder.length - 1 ? 'disabled' : ''} title="Geser ke bawah">&#9660;</button>
      </div>
    `;

    orderListContainer.appendChild(row);
  });

  orderListContainer.querySelectorAll('.order-select').forEach((select) => {
    select.addEventListener('change', (e) => {
      const targetIdx = parseInt(e.target.dataset.index, 10);
      const selectedType = e.target.value;
      const existingIdx = draftDocOrder.indexOf(selectedType);

      if (existingIdx !== -1 && existingIdx !== targetIdx) {
        const temp = draftDocOrder[targetIdx];
        draftDocOrder[targetIdx] = selectedType;
        draftDocOrder[existingIdx] = temp;
      }
      renderOrderModalList();
    });
  });

  orderListContainer.querySelectorAll('.btn-move').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const dir = parseInt(btn.dataset.dir, 10);
      const swapIdx = idx + dir;

      if (swapIdx >= 0 && swapIdx < draftDocOrder.length) {
        const temp = draftDocOrder[idx];
        draftDocOrder[idx] = draftDocOrder[swapIdx];
        draftDocOrder[swapIdx] = temp;
        renderOrderModalList();
      }
    });
  });
}

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
 * 2. Kode Dealer: deretan digit unik dealer (misal 100601), mengabaikan pola tanggal/tahun
 */
function extractEntities(file) {
  const fileNameNoExt = file.name.replace(/\.pdf$/i, '');
  const normalized = fileNameNoExt.toLowerCase();

  // 1. Deteksi Jenis File
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

  const nonDateTokens = numericTokens.filter((num) => {
    const isFullDate = num.length === 8 && /^20[23]\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(num);
    const isYearMonth = num.length === 6 && /^20[23]\d(0[1-9]|1[0-2])$/.test(num);
    return !isFullDate && !isYearMonth;
  });

  const candidateTokens = nonDateTokens.length > 0 ? nonDateTokens : numericTokens;

  const standardCode = candidateTokens.find((num) => num.length >= 5 && num.length <= 8);
  if (standardCode) {
    dealerCode = standardCode;
  } else {
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

  // Fallback: cek nama folder induk jika kode dealer tidak tertulis di nama file
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
    alert(`Total ukuran PDF (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) melebihi batas maksimal 300 MB.`);
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
        outputFilename: `${dealerCode}_Compile.pdf`
      });
    }

    dealerMap.get(dealerCode).docs[docType].push(file);
  });

  groupedDealers = Array.from(dealerMap.values()).sort((a, b) =>
    a.dealerCode.localeCompare(b.dealerCode, undefined, { numeric: true })
  );

  groupedDealers.forEach((group) => {
    const missing = [];
    const notes = [];

    DEFAULT_DOC_ORDER.forEach((type) => {
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
      const foundLabels = docOrder
        .filter((t) => group.docs[t].length > 0)
        .map((t) => DOC_LABELS[t]);

      group.keterangan = `Tidak Lengkap — Kurang: ${missing.join(', ')} (Ada: ${foundLabels.join(', ')})`;
      if (notes.length) {
        group.keterangan += ` • ${notes.join(', ')}`;
      }
      addLog(`Dealer ${group.dealerCode}: ${group.keterangan}`, 'warn');
    }
  });

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
        <td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">
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

    const firstDocType = docOrder[0];
    const secondDocType = docOrder[1];
    const thirdDocType = docOrder[2];

    tr.innerHTML = `
      <td><span class="code-tag">${escapeHtml(group.dealerCode)}</span></td>
      <td>${formatCell(group.docs[firstDocType])}</td>
      <td>${formatCell(group.docs[secondDocType])}</td>
      <td>${formatCell(group.docs[thirdDocType])}</td>
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
  btnOpenSettings.disabled = true;
  progressWrap.style.display = 'block';

  const zip = new JSZip();
  const orderHeaderLabel = docOrder.map((k) => DOC_LABELS[k].toUpperCase()).join(' -> ');
  const summaryLines = [
    `KODE DEALER;FILE OUTPUT;TATA LETAK (${orderHeaderLabel});STATUS;KETERANGAN;INVOICE;EMAIL;REPORT`
  ];

  try {
    for (let i = 0; i < groupedDealers.length; i++) {
      const group = groupedDealers[i];
      const percent = Math.round(((i + 1) / groupedDealers.length) * 100);
      progressFill.style.width = `${percent}%`;
      progressLabel.textContent = `Menggabungkan ${group.outputFilename} (${i + 1}/${groupedDealers.length})...`;
      progressPercent.textContent = `${percent}%`;

      await new Promise((resolve) => setTimeout(resolve, 0));

      const mergedPdf = await PDFLib.PDFDocument.create();
      let mergedPageCount = 0;

      for (const type of docOrder) {
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
          docOrder.map((k) => DOC_LABELS[k]).join(' -> '),
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
    btnOpenSettings.disabled = false;
  }
}
