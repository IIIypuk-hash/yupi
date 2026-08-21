const form = document.getElementById("upload-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");

const dropzones = [
  { zone: document.getElementById("dropzone-1"), input: document.getElementById("file-1"), label: document.getElementById("label-1"), defaultText: "Документ №1 — выбрать файл" },
  { zone: document.getElementById("dropzone-2"), input: document.getElementById("file-2"), label: document.getElementById("label-2"), defaultText: "Документ №2 — выбрать файл" },
];

function updateSubmitState() {
  submitBtn.disabled = !dropzones.every((dz) => dz.input.files.length > 0);
}

function setFile(dz, file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".docx")) {
    statusEl.textContent = `Файл «${file.name}» должен быть в формате .docx`;
    statusEl.className = "status err";
    return;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  dz.input.files = dt.files;
  dz.label.textContent = file.name;
  dz.zone.classList.add("filled");
  statusEl.textContent = "";
  statusEl.className = "status";
  updateSubmitState();
}

dropzones.forEach((dz) => {
  dz.zone.addEventListener("click", () => dz.input.click());

  dz.input.addEventListener("change", () => {
    if (dz.input.files[0]) setFile(dz, dz.input.files[0]);
  });

  dz.zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.zone.classList.add("dragover");
  });

  dz.zone.addEventListener("dragleave", () => {
    dz.zone.classList.remove("dragover");
  });

  dz.zone.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.zone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    setFile(dz, file);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  statusEl.textContent = "Загрузка...";
  statusEl.className = "status";

  const formData = new FormData();
  formData.append("document1", dropzones[0].input.files[0]);
  formData.append("document2", dropzones[1].input.files[0]);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Не удалось загрузить файлы");
    }

    const names = data.files.map((f) => `• ${f.filename} (${(f.size / 1024).toFixed(1)} КБ)`).join("\n");
    statusEl.textContent = `Файлы успешно загружены:\n${names}`;
    statusEl.className = "status ok";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status err";
  } finally {
    updateSubmitState();
  }
});
