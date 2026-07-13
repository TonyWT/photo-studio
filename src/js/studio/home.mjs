import './../../css/studio.css';
import { isNativeProjectDocument, isSupportedImage, projectStore } from './project-store.mjs';

const home = document.querySelector('[data-page="home"]');

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function openEditor() {
  window.location.assign('./editor/');
}

function openCollage(template) {
  window.location.assign(`./editor/?collage=${encodeURIComponent(template)}`);
}

async function openFile(file) {
  if (!isSupportedImage(file)) {
    window.alert('请选择 PNG、JPG、WebP、GIF、BMP 或 TIFF 图片。');
    return;
  }
  await projectStore.stashFile(file);
  openEditor();
}

function showProjectImportError(message = '') {
  const target = document.querySelector('[data-testid="project-import-error"]');
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

async function importProject(file) {
  showProjectImportError();
  if (!file) return;
  try {
    const document = JSON.parse(await file.text());
    if (!isNativeProjectDocument(document)) {
      showProjectImportError('这不是有效的原生项目文件。');
      return;
    }
    await projectStore.stashDocument(document, file.name);
    openEditor();
  } catch {
    showProjectImportError('这不是有效的原生项目文件。');
  }
}

async function renderProjects() {
  const target = document.querySelector('[data-testid="recent-projects"]');
  const projects = await projectStore.listProjects();
  if (!projects.length) {
    target.innerHTML = '<p class="studio-empty">尚无本地项目。打开一张图片后会自动保存在此浏览器中。</p>';
    return;
  }
  target.innerHTML = projects.map((project) => `
    <article class="project-card" data-project-id="${project.id}">
      <button class="project-open" data-open-project="${project.id}" aria-label="打开项目 ${project.name}">
        ${project.thumbnail ? `<img src="${project.thumbnail}" alt="${project.name} 缩略图">` : '<span class="project-placeholder">图</span>'}
      </button>
      <div><strong>${project.name}</strong><span>${formatDate(project.updatedAt)}</span></div>
      <button class="project-delete" data-delete-project="${project.id}" aria-label="删除项目 ${project.name}">删除</button>
    </article>`).join('');
}

async function onProjectAction(event) {
  const openButton = event.target.closest('[data-open-project]');
  if (openButton) {
    await projectStore.stashProject(openButton.dataset.openProject);
    openEditor();
    return;
  }
  const deleteButton = event.target.closest('[data-delete-project]');
  if (deleteButton && window.confirm('删除这个本地项目？此操作不可恢复。')) {
    await projectStore.deleteProject(deleteButton.dataset.deleteProject);
    await renderProjects();
  }
}

if (home) {
  const picker = document.querySelector('[data-testid="image-picker"]');
  const projectPicker = document.querySelector('[data-testid="project-picker"]');
  const dropzone = document.querySelector('[data-testid="dropzone"]');
  document.querySelector('[data-testid="open-image"]').addEventListener('click', () => picker.click());
  document.querySelector('[data-testid="import-project"]').addEventListener('click', () => projectPicker.click());
  const collagePicker = document.querySelector('[data-testid="collage-templates"]');
  document.querySelector('[data-testid="create-collage"]').addEventListener('click', () => {
    collagePicker.hidden = !collagePicker.hidden;
  });
  collagePicker.addEventListener('click', (event) => {
    const template = event.target.closest('[data-collage-template]')?.dataset.collageTemplate;
    if (template) openCollage(template);
  });
  picker.addEventListener('change', (event) => openFile(event.target.files?.[0]));
  projectPicker.addEventListener('change', (event) => importProject(event.target.files?.[0]));
  dropzone.addEventListener('dragover', (event) => event.preventDefault());
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    openFile(event.dataTransfer.files?.[0]);
  });
  document.querySelector('[data-testid="recent-projects"]').addEventListener('click', onProjectAction);
  renderProjects()
    .catch(() => {
      document.querySelector('[data-testid="recent-projects"]').innerHTML = '<p class="studio-empty">浏览器本地存储不可用，仍可直接编辑和导出图片。</p>';
    })
    .finally(() => { home.dataset.ready = 'true'; });
}
