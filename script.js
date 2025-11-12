// Global state
let selectedFiles = [];
let mergedPDFDoc = null;
let currentPreviewPage = 0;
let totalPreviewPages = 0;
let zoomLevel = 100;

// ===== Custom Select Initialization =====
function initializeCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(selectContainer => {
    const toggle = selectContainer.querySelector('.custom-select-toggle');
    const menu = selectContainer.querySelector('.custom-select-menu');
    const options = menu.querySelectorAll('.custom-select-option');

    // Toggle menu
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.style.display !== 'none';
      closeAllSelectMenus();
      if (!isOpen) {
        menu.style.display = 'block';
        toggle.classList.add('active');
      }
    });

    // Select option
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.getAttribute('data-value');
        const text = option.textContent.trim();

        // Update toggle text
        toggle.querySelector('.custom-select-text').textContent = text;
        toggle.setAttribute('data-value', value);

        // Update hidden input
        const hiddenInput = selectContainer.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          hiddenInput.value = value;
        }

        // Update selected state
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Close menu
        menu.style.display = 'none';
        toggle.classList.remove('active');
      });
    });

    // Set initial selected state
    const initialValue = toggle.getAttribute('data-value');
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === initialValue) {
        opt.classList.add('selected');
      }
    });
  });

  // Close all menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select')) {
      closeAllSelectMenus();
    }
  });
}

function closeAllSelectMenus() {
  document.querySelectorAll('.custom-select-menu').forEach(menu => {
    menu.style.display = 'none';
  });
  document.querySelectorAll('.custom-select-toggle').forEach(toggle => {
    toggle.classList.remove('active');
  });
}

// ===== File Handling =====
document.getElementById('fileInput').addEventListener('change', handleFileSelection);
document.querySelector('.file-input-wrapper').addEventListener('dragover', handleDragOver);
document.querySelector('.file-input-wrapper').addEventListener('drop', handleDrop);
document.getElementById('clearAllBtn').addEventListener('click', clearAllFiles);

function handleFileSelection(event) {
  const files = event.target.files;
  addFilesToList(files);
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.style.opacity = '0.5';
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.style.opacity = '1';
  const files = event.dataTransfer.files;
  addFilesToList(files);
}

function addFilesToList(files) {
  Array.from(files).forEach(file => {
    if (file.type === 'application/pdf') {
      selectedFiles.push(file);
    }
  });
  renderFileList();
}

function renderFileList() {
  const fileList = document.getElementById('fileList');
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.draggable = true;

    const fileName = document.createElement('span');
    fileName.className = 'file-item-name';
    fileName.textContent = file.name;

    const fileSize = document.createElement('span');
    fileSize.className = 'file-item-size';
    fileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-item-remove';
    removeBtn.textContent = '移除';
    removeBtn.addEventListener('click', () => {
      selectedFiles.splice(index, 1);
      renderFileList();
    });

    li.appendChild(fileName);
    li.appendChild(fileSize);
    li.appendChild(removeBtn);
    fileList.appendChild(li);
  });

  // Initialize Sortable.js
  if (fileList.children.length > 0) {
    Sortable.create(fileList, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function(evt) {
        const newOrder = Array.from(fileList.children).map((li, i) => {
          return selectedFiles.find(f => f.name === li.querySelector('.file-item-name').textContent);
        });
        selectedFiles = newOrder;
      }
    });
  }
}

function clearAllFiles() {
  if (confirm('確定要清除所有檔案嗎？')) {
    selectedFiles = [];
    renderFileList();
    document.getElementById('previewCanvas').style.display = 'none';
    document.getElementById('previewPlaceholder').style.display = 'block';
  }
}

// ===== Preview Function =====
document.getElementById('previewBtn').addEventListener('click', previewMergedPDF);

async function previewMergedPDF() {
  if (selectedFiles.length === 0) {
    alert('請先選擇 PDF 檔案');
    return;
  }

  try {
    document.getElementById('previewPlaceholder').textContent = '正在生成預覽...';
    mergedPDFDoc = await mergePDFs();
    currentPreviewPage = 0;
    totalPreviewPages = mergedPDFDoc.getPageCount();
    zoomLevel = 100;

    document.getElementById('currentPage').textContent = '1';
    document.getElementById('totalPages').textContent = totalPreviewPages;
    document.getElementById('zoomLevel').textContent = '100';

    await renderPreviewPage();
  } catch (error) {
    alert('預覽失敗: ' + error.message);
    document.getElementById('previewPlaceholder').textContent = '預覽失敗';
  }
}

async function mergePDFs() {
  const PDFDocument = PDFLib.PDFDocument;
  const mergedDoc = await PDFDocument.create();

  const layout = document.getElementById('layoutInput').value;
  const pageSize = document.getElementById('pagesizeInput').value;
  const rotation = document.getElementById('rotationInput').value;

  for (const file of selectedFiles) {
    const arrayBuffer = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(arrayBuffer);

    for (let i = 0; i < sourceDoc.getPageCount(); i++) {
      let page = sourceDoc.getPage(i);
      let { width, height } = page.getSize();

      // 页面大小处理
      if (layout !== 'merge') {
        const targetSize = getPageDimensions(pageSize);
        const isPortrait = height >= width;
        const targetPortrait = layout === 'portrait';

        if (isPortrait !== targetPortrait) {
          if (rotation === 'auto') {
            page = await mergedDoc.embedPage(page);
            let embeddedPage = await mergedDoc.addPage([height, width]);
            embeddedPage.drawPage(page, { x: 0, y: 0, width: height, height: width });
            page = embeddedPage;
            [width, height] = [height, width];
          } else {
            const tempPage = await mergedDoc.embedPage(page);
            let rotatedPage = await mergedDoc.addPage([height, width]);
            rotatedPage.drawPage(tempPage, { x: 0, y: 0, width: height, height: width });
            page = rotatedPage;
            [width, height] = [height, width];
          }
        }

        if (Math.abs(width - targetSize.width) > 1 || Math.abs(height - targetSize.height) > 1) {
          const scaleX = targetSize.width / width;
          const scaleY = targetSize.height / height;
          const scale = Math.min(scaleX, scaleY);

          const embeddedPage = await mergedDoc.embedPage(page);
          let resizedPage = await mergedDoc.addPage([targetSize.width, targetSize.height]);
          const scaledWidth = width * scale;
          const scaledHeight = height * scale;
          const x = (targetSize.width - scaledWidth) / 2;
          const y = (targetSize.height - scaledHeight) / 2;

          resizedPage.drawPage(embeddedPage, { x, y, width: scaledWidth, height: scaledHeight });
          page = resizedPage;
        }
      }

      const embeddedPage = await mergedDoc.embedPage(page);
      const newPage = await mergedDoc.addPage([embeddedPage.width, embeddedPage.height]);
      newPage.drawPage(embeddedPage);
    }
  }

  return mergedDoc;
}

function getPageDimensions(size) {
  const sizes = {
    'A4': { width: 595, height: 842 },
    'A3': { width: 842, height: 1191 },
    'A5': { width: 420, height: 595 },
    'Letter': { width: 612, height: 792 }
  };
  return sizes[size] || sizes.A4;
}

async function renderPreviewPage() {
  if (!mergedPDFDoc || totalPreviewPages === 0) return;

  try {
    const pdfBytes = await mergedPDFDoc.save();
    const pdfData = new Uint8Array(pdfBytes);

    pdfjsLib.getDocument(pdfData).promise.then(pdfDoc => {
      pdfDoc.getPage(currentPreviewPage + 1).then(page => {
        const scale = zoomLevel / 100;
        const viewport = page.getViewport({ scale: 1.5 * scale });

        const canvas = document.getElementById('previewCanvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: canvas.getContext('2d'),
          viewport: viewport
        };

        page.render(renderContext).promise.then(() => {
          canvas.style.display = 'block';
          document.getElementById('previewPlaceholder').style.display = 'none';
          document.getElementById('currentPage').textContent = currentPreviewPage + 1;
        });
      });
    });
  } catch (error) {
    document.getElementById('previewPlaceholder').textContent = '渲染失敗';
  }
}

// ===== Navigation Buttons =====
document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPreviewPage > 0) {
    currentPreviewPage--;
    renderPreviewPage();
  }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  if (currentPreviewPage < totalPreviewPages - 1) {
    currentPreviewPage++;
    renderPreviewPage();
  }
});

document.getElementById('zoomInBtn').addEventListener('click', () => {
  if (zoomLevel < 200) {
    zoomLevel += 25;
    document.getElementById('zoomLevel').textContent = zoomLevel;
    renderPreviewPage();
  }
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
  if (zoomLevel > 50) {
    zoomLevel -= 25;
    document.getElementById('zoomLevel').textContent = zoomLevel;
    renderPreviewPage();
  }
});

// ===== Download Function =====
document.getElementById('downloadBtn').addEventListener('click', downloadMergedPDF);

async function downloadMergedPDF() {
  if (selectedFiles.length === 0) {
    alert('請先選擇 PDF 檔案');
    return;
  }

  try {
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('downloadBtn').textContent = '⏳ 正在處理...';

    const mergedDoc = await mergePDFs();
    const pdfBytes = await mergedDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = document.getElementById('outputName').value + '.pdf';
    link.click();

    URL.revokeObjectURL(url);

    document.getElementById('downloadBtn').disabled = false;
    document.getElementById('downloadBtn').textContent = '⬇️ 下載';
  } catch (error) {
    alert('下載失敗: ' + error.message);
    document.getElementById('downloadBtn').disabled = false;
    document.getElementById('downloadBtn').textContent = '⬇️ 下載';
  }
}

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  initializeCustomSelects();
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';
});