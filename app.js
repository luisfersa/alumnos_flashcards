// =========================================================
// CARGA SEGURA DEL ESTADO (MP7: try/catch en localStorage)
// =========================================================
const state = {
    classes: {},
    classRows: [], // Guarda las clases organizadas por filas (niveles)
    theme: 'dark',
    currentClasses: [],
    currentGameMode: null,
    gameData: [],
    gameIndex: 0,
    score: 0,
    timer: null,
    timeLeft: 60,
    classicTimeout: null  // B3: referencia al timeout de auto-avance
};

(function loadPersistedState() {
    try {
        const raw = localStorage.getItem('flashcards_classes');
        state.classes = raw ? JSON.parse(raw) : {};
        const rawOrder = localStorage.getItem('flashcards_classRows');
        const parsedOrder = rawOrder ? JSON.parse(rawOrder) : null;
        if (parsedOrder && parsedOrder.length > 0) {
            state.classRows = parsedOrder;
        } else {
            state.classRows = autoGroupClasses(Object.keys(state.classes));
        }
    } catch (e) {
        console.error('[Flashcards] Error leyendo clases:', e);
        state.classes = {};
        state.classOrder = [];
    }
    try {
        state.theme = localStorage.getItem('flashcards_theme') || 'dark';
    } catch (e) {
        state.theme = 'dark';
    }
})();

// =========================================================
// REFERENCIAS DOM
// =========================================================
const screens = {
    home:  document.getElementById('screen-home'),
    class: document.getElementById('screen-class'),
    game:  document.getElementById('screen-game')
};

const dom = {
    appTitle:            document.getElementById('app-title'),
    excelUpload:         document.getElementById('excel-upload'),
    classesList:         document.getElementById('classes-list'),
    currentClassTitle:   document.getElementById('current-class-title'),
    backToHomeBtn:       document.getElementById('back-to-home'),
    photoUpload:         document.getElementById('photo-upload'),
    photoLoading:        document.getElementById('photo-loading'),
    studentsList:        document.getElementById('students-list'),
    gameBtns:            document.querySelectorAll('.game-btn'),
    quitGameBtn:         document.getElementById('quit-game'),
    gameArea:            document.getElementById('game-area'),
    gameProgress:        document.getElementById('game-progress'),
    gameScore:           document.getElementById('game-score'),
    gameTime:            document.getElementById('game-time'),
    editModal:           document.getElementById('edit-modal'),
    closeEditModal:      document.getElementById('close-edit-modal'),
    cancelEditBtn:       document.getElementById('cancel-edit-btn'),
    editForm:            document.getElementById('edit-form'),
    editStudentId:       document.getElementById('edit-student-id'),
    editNombre:          document.getElementById('edit-nombre'),
    editApellidos:       document.getElementById('edit-apellidos'),
    editAka:             document.getElementById('edit-aka'),
    editPhoto:           document.getElementById('edit-photo'),
    editPhotoPreview:    document.getElementById('edit-photo-preview'),  // U5
    confirmOverlay:      document.getElementById('confirm-overlay'),
    confirmMessage:      document.getElementById('confirm-message'),
    confirmYes:          document.getElementById('confirm-yes'),
    confirmNo:           document.getElementById('confirm-no'),
};

// =========================================================
// TOAST NOTIFICATIONS (MP4: reemplaza alert/confirm nativos)
// =========================================================
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('toast-visible'));
    });
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// Confirm dialog propio (MP4: reemplaza confirm() nativo)
function showConfirm(message) {
    return new Promise(resolve => {
        dom.confirmMessage.textContent = message;
        dom.confirmOverlay.classList.remove('hidden');

        const cleanup = (result) => {
            dom.confirmOverlay.classList.add('hidden');
            dom.confirmYes.removeEventListener('click', onYes);
            dom.confirmNo.removeEventListener('click', onNo);
            resolve(result);
        };
        const onYes = () => cleanup(true);
        const onNo  = () => cleanup(false);

        dom.confirmYes.addEventListener('click', onYes,  { once: true });
        dom.confirmNo.addEventListener('click',  onNo,   { once: true });
    });
}

// =========================================================
// PERSISTENCIA (MP7: try/catch en escritura)
// =========================================================
function saveState() {
    try {
        localStorage.setItem('flashcards_classes', JSON.stringify(state.classes));
        localStorage.setItem('flashcards_classRows', JSON.stringify(state.classRows));
    } catch (e) {
        showToast('Error al guardar. El almacenamiento puede estar lleno.', 'error');
    }
}

// =========================================================
// INICIALIZACIÓN
// =========================================================
function init() {
    // Tema
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        themeSelector.value = state.theme;
        document.documentElement.setAttribute('data-theme', state.theme);
        themeSelector.addEventListener('change', (e) => {
            state.theme = e.target.value;
            try { localStorage.setItem('flashcards_theme', state.theme); } catch(err) {}
            document.documentElement.setAttribute('data-theme', state.theme);
        });
    }

    renderClasses();

    // Navegación
    dom.appTitle.addEventListener('click', showHomeScreen);
    dom.backToHomeBtn.addEventListener('click', showHomeScreen);
    dom.quitGameBtn.addEventListener('click', exitGame); // B1: exitGame definida más abajo, pero se usa como referencia

    // Botones de clases (home)
    document.getElementById('btn-view-all').addEventListener('click', () => {
        const all = Object.keys(state.classes);
        if (all.length > 0) showClassScreen(all);
        else showToast('No hay clases cargadas todavía.', 'warning');
    });

    document.getElementById('btn-view-selected').addEventListener('click', () => {
        const sel = getSelectedClasses();
        if (sel.length > 0) showClassScreen(sel);
        else showToast('Selecciona al menos una clase.', 'warning');
    });

    document.getElementById('btn-auto-sort').addEventListener('click', () => {
        if (Object.keys(state.classes).length === 0) return;
        if (confirm("¿Quieres reordenar automáticamente todas las clases por niveles? Perderás tu orden manual actual.")) {
            state.classRows = autoGroupClasses(Object.keys(state.classes));
            saveState();
            renderClasses();
        }
    });

    document.getElementById('btn-deselect-all').addEventListener('click', () => {  // U3
        document.querySelectorAll('.class-checkbox:checked').forEach(cb => {
            cb.checked = false;
            cb.closest('.class-card')?.classList.remove('selected');
        });
    });

    document.getElementById('btn-delete-selected').addEventListener('click', async () => {
        const sel = getSelectedClasses();
        if (sel.length === 0) { showToast('Selecciona al menos una clase para eliminar.', 'warning'); return; }
        const ok = await showConfirm(`¿Eliminar ${sel.length} clase(s)?`);
        if (ok) {
            sel.forEach(c => {
                delete state.classes[c];
                state.classRows.forEach(row => {
                    const idx = row.indexOf(c);
                    if (idx !== -1) row.splice(idx, 1);
                });
            });
            saveState();
            renderClasses();
            showToast('Clases eliminadas correctamente.', 'success');
        }
    });

    // Excel y Fotos
    dom.excelUpload.addEventListener('change', handleExcelUpload);
    dom.photoUpload.addEventListener('change', handlePhotoUpload);

    // Modal de edición
    dom.closeEditModal.addEventListener('click', closeEditModal);
    dom.cancelEditBtn.addEventListener('click', closeEditModal);
    dom.editForm.addEventListener('submit', handleEditSubmit);

    // U5: Preview de foto al seleccionarla en el modal
    dom.editPhoto.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                dom.editPhotoPreview.src = evt.target.result;
                dom.editPhotoPreview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    // Botones de modos de juego (MP1: addEventListener en vez de onclick inline)
    dom.gameBtns.forEach(btn => {
        btn.addEventListener('click', () => startGame(btn.dataset.mode));
    });

    // SortableJS para los alumnos
    new Sortable(dom.studentsList, {
        animation: 150,
        handle: '.student-drag-handle',
        onEnd: () => {
            if (state.currentClasses.length > 1) {
                showToast('El reordenamiento solo se guarda con una clase visible.', 'warning');
                renderStudents();
                return;
            }
            const className = state.currentClasses[0];
            const newOrderIds = Array.from(dom.studentsList.children).map(li => li.dataset.id);
            const arr = state.classes[className];
            state.classes[className] = newOrderIds.map(id => arr.find(s => s.id === id)).filter(Boolean);
            saveState();
        }
    });


    // U7: Atajos de teclado en el juego
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Agenda de contactos
    initAgenda();

    // Backup & Restore
    initBackup();
}

// =========================================================
// B1 FIXED: exitGame declarada como función nombrada (hoisting seguro)
// B8 FIXED: limpia el timer y el classicTimeout al salir
// =========================================================
function exitGame() {
    clearInterval(state.timer);
    state.timer = null;
    if (state.classicTimeout) {
        clearTimeout(state.classicTimeout);
        state.classicTimeout = null;
    }
    showClassScreen(state.currentClasses);
}

// =========================================================
// NAVEGACIÓN
// =========================================================
function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

function showHomeScreen() {
    clearInterval(state.timer);
    state.timer = null;
    switchScreen('home');
    renderClasses();
}

function showClassScreen(classesArray) {
    state.currentClasses = classesArray;
    dom.currentClassTitle.textContent = classesArray.length > 1
        ? `${classesArray.length} clases seleccionadas`
        : classesArray[0];
    switchScreen('class');
    renderStudents();
}

// =========================================================
// HELPERS
// =========================================================
function getSelectedClasses() {
    return Array.from(document.querySelectorAll('.class-checkbox:checked')).map(cb => cb.value);
}

function getAllGameStudents() {
    const students = [];
    state.currentClasses.forEach(c => { if (state.classes[c]) students.push(...state.classes[c]); });
    return students;
}

// =========================================================
// EXCEL
// =========================================================
function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
            processExcelData(json);
        } catch (err) {
            showToast('Error al leer el archivo. Comprueba que es un Excel válido.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

function processExcelData(rows) {
    const newClasses = {};
    rows.forEach(row => {
        const keys = Object.keys(row);
        
        // Función auxiliar mejorada para buscar columnas
        const getCol = (possibleNames) => {
            // 1. Buscar coincidencia exacta (ignorando mayúsculas)
            let key = keys.find(k => possibleNames.some(n => k.trim().toLowerCase() === n.toLowerCase()));
            
            // 2. Si no hay exacta, buscar que empiece por... (para evitar coger "TUTOR1: NOMBRE")
            if (!key) {
                key = keys.find(k => possibleNames.some(n => k.trim().toLowerCase().startsWith(n.toLowerCase())));
            }
            
            // 3. Fallback: que lo contenga
            if (!key) {
                key = keys.find(k => possibleNames.some(n => k.trim().toLowerCase().includes(n.toLowerCase())));
            }
            
            return key ? String(row[key]).trim() : '';
        };

        let nombre = getCol(['nombre', 'alumno']);
        let apellidos = getCol(['apellido']);
        const grupo = getCol(['grupo', 'clase', 'curso']) || 'Sin Grupo';
        
        // Datos extraídos para futuras funcionalidades (agenda, etc.)
        const fechaNacimiento = getCol(['fecha nacimiento', 'nacimiento']);
        const paisNacimiento = getCol(['pais nacimiento', 'país']);
        const correoEducacyl = getCol(['usuario o correo educacyl', 'correo', 'email']);
        const telefonosAlumno = getCol(['telefonos', 'teléfono', 'telefono']);
        const municipio = getCol(['municipio', 'localidad']);
        
        let tutor1Nombre = getCol(['tutor1: nombre', 'tutor 1: nombre', 'tutor 1']);
        const tutor1Telefonos = getCol(['tutor1: telefonos', 'tutor 1: telefonos']);
        const tutor1Email = getCol(['tutor1: email', 'tutor 1: email']);
        
        let tutor2Nombre = getCol(['tutor2: nombre', 'tutor 2: nombre', 'tutor 2']);
        const tutor2Telefonos = getCol(['tutor2: telefonos', 'tutor 2: telefonos']);
        const tutor2Email = getCol(['tutor2: email', 'tutor 2: email']);
        
        if (!nombre) return;
        
        // Función auxiliar para pasar de "PÉREZ GARCÍA" a "Pérez García" para que se vea más bonito en la app
        const toTitleCase = (str) => {
            if (!str) return '';
            return str.toLowerCase().split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        };

        // Función para procesar nombres en formato "APELLIDOS, NOMBRE"
        const parseEducacylName = (nameStr, surnameStr) => {
            if (!surnameStr && nameStr.includes(',')) {
                const parts = nameStr.split(',');
                return { 
                    ap: toTitleCase(parts[0].trim()), 
                    nom: toTitleCase(parts[1].trim()) 
                };
            }
            return { nom: toTitleCase(nameStr), ap: toTitleCase(surnameStr) };
        };

        // Procesar nombre del alumno
        const parsedAlumno = parseEducacylName(nombre, apellidos);
        nombre = parsedAlumno.nom;
        apellidos = parsedAlumno.ap;
        
        // Procesar nombres de los tutores (vienen en el mismo formato)
        tutor1Nombre = toTitleCase(tutor1Nombre);
        if (tutor1Nombre.includes(',')) {
            const parts = tutor1Nombre.split(',');
            tutor1Nombre = parts[1].trim() + ' ' + parts[0].trim();
        }
        
        tutor2Nombre = toTitleCase(tutor2Nombre);
        if (tutor2Nombre.includes(',')) {
            const parts = tutor2Nombre.split(',');
            tutor2Nombre = parts[1].trim() + ' ' + parts[0].trim();
        }
        
        const generateSafeId = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            return Date.now().toString(36) + Math.random().toString(36).substring(2);
        };
        
        if (!newClasses[grupo]) {
            newClasses[grupo] = [];
            const exists = state.classRows.some(row => row.includes(grupo));
            if (!exists) {
                if (state.classRows.length > 0) {
                    state.classRows[state.classRows.length - 1].push(grupo);
                } else {
                    state.classRows.push([grupo]);
                }
            }
        }
        newClasses[grupo].push({
            id: generateSafeId(), // B5: UUID seguro (con fallback para file://)
            nombre: nombre,
            apellidos: apellidos,
            fechaNacimiento: fechaNacimiento,
            paisNacimiento: paisNacimiento,
            correoEducacyl: correoEducacyl,
            telefonos: telefonosAlumno,
            municipio: municipio,
            tutor1: {
                nombre: tutor1Nombre,
                telefonos: tutor1Telefonos,
                email: tutor1Email
            },
            tutor2: {
                nombre: tutor2Nombre,
                telefonos: tutor2Telefonos,
                email: tutor2Email
            }
        });
    });

    state.classes = newClasses;
    saveState();
    renderClasses();
    const totalAlumnos = Object.values(newClasses).reduce((sum, arr) => sum + arr.length, 0);
    showToast(`Cargado: ${Object.keys(newClasses).length} clases, ${totalAlumnos} alumnos.`, 'success');
}

// Lista de instancias sortable para limpiarlas si re-renderizamos
let rowSortables = [];

function renderClasses() {
    // Limpiar instancias previas
    rowSortables.forEach(s => {
        try { s.destroy(); } catch(e) {}
    });
    rowSortables = [];
    
    dom.classesList.innerHTML = '';
    
    if (Object.keys(state.classes).length === 0) {
        dom.classesList.innerHTML = '<p class="text-muted">Aún no hay clases. Sube tu Excel.</p>';
        return;
    }
    
    // Asegurar que siempre hay una fila vacía al final para poder crear nuevos niveles
    const renderRows = [...state.classRows];
    if (renderRows.length === 0 || renderRows[renderRows.length - 1].length > 0) {
        renderRows.push([]);
    }
    
    renderRows.forEach((rowCards, rowIndex) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'class-row';
        rowEl.dataset.rowIndex = rowIndex;
        
        rowCards.forEach(className => {
            if (state.classes[className]) {
                const card = document.createElement('div');
                card.className = 'class-card';
                card.dataset.className = className;
                const n = state.classes[className].length;
                card.innerHTML = `
                    <div class="class-drag-handle" style="position:absolute; top:10px; right:10px; color:var(--text-muted); cursor:grab;">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    </div>
                    <input type="checkbox" class="class-checkbox" value="${className}" aria-label="Seleccionar ${className}">
                    <h3>${className}</h3>
                    <p class="text-muted">${n} alumnos</p>
                `;
                
                const openBtn = document.createElement('button');
                openBtn.className = 'btn secondary btn-open-class';
                openBtn.textContent = 'Abrir →';
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showClassScreen([className]);
                });
                card.appendChild(openBtn);

                const checkbox = card.querySelector('.class-checkbox');
                card.addEventListener('click', (e) => {
                    if (e.target === checkbox || e.target === openBtn) return;
                    checkbox.checked = !checkbox.checked;
                    card.classList.toggle('selected', checkbox.checked);
                });
                checkbox.addEventListener('change', () => {
                    card.classList.toggle('selected', checkbox.checked);
                });
                
                rowEl.appendChild(card);
            }
        });
        
        dom.classesList.appendChild(rowEl);
        
        const sortable = new Sortable(rowEl, {
            group: 'rows', // Permite arrastrar entre diferentes filas
            animation: 150,
            handle: '.class-drag-handle',
            onStart: () => document.body.classList.add('is-dragging'),
            onEnd: (evt) => {
                document.body.classList.remove('is-dragging');
                
                // Releer todo el estado desde el DOM
                const newRows = [];
                Array.from(dom.classesList.children).forEach(r => {
                    const cards = Array.from(r.children).map(c => c.dataset.className).filter(Boolean);
                    // Mantenemos filas vacías si están en medio (huecos). 
                    // Al final se añaden automáticamente.
                    newRows.push(cards); 
                });
                
                // Limpiar filas vacías consecutivas al final
                while (newRows.length > 0 && newRows[newRows.length - 1].length === 0) {
                    newRows.pop();
                }
                
                state.classRows = newRows;
                saveState();
                
                // Añadir un nuevo hueco vacío al final si el último ahora tiene cartas
                const lastRow = dom.classesList.lastElementChild;
                if (lastRow && lastRow.children.length > 0) {
                    renderClasses(); // Redibujamos para regenerar la fila vacía extra de forma limpia
                }
            }
        });
        rowSortables.push(sortable);
    });
}

// =========================================================
// FOTOS — CARGA MASIVA
// B2 FIXED: Promise.all garantiza que renderStudents se llama
//           solo cuando todas las fotos están guardadas
// =========================================================

// =========================================================
// MAPEO DE FOTOS INTERACTIVO
// =========================================================

let currentPhotoMapping = {
    students: [],
    files: [],
    filePreviews: new Map(),
    sortableInst: null
};

async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (state.currentClasses.length === 0) return;

    // Build students array
    const students = [];
    state.currentClasses.forEach(c => {
        if (state.classes[c]) {
            state.classes[c].forEach(s => students.push({ ...s, _grupoOriginal: c }));
        }
    });

    students.sort((a, b) => {
        const nameA = ((a.apellidos || '') + ' ' + a.nombre).toLowerCase().trim();
        const nameB = ((b.apellidos || '') + ' ' + b.nombre).toLowerCase().trim();
        return nameA.localeCompare(nameB);
    });

    // Custom sort Windows "descarga.jpg", "descarga (1).jpg"
    files.sort((a, b) => {
        const getWindowsKey = (filename) => {
            const match = filename.match(/^(.*?)(?: \((\d+)\))?(\.[^\.]+)$/);
            if (!match) return { base: filename, num: 0 };
            return { base: match[1].trim(), num: match[2] ? parseInt(match[2], 10) : 0 };
        };
        const keyA = getWindowsKey(a.name);
        const keyB = getWindowsKey(b.name);
        if (keyA.base !== keyB.base) {
            return keyA.base.localeCompare(keyB.base, undefined, { numeric: true });
        }
        return keyA.num - keyB.num;
    });

    currentPhotoMapping.students = students;
    currentPhotoMapping.files = [...files];
    currentPhotoMapping.filePreviews = new Map();

    for(let i=0; i<files.length; i++) {
        currentPhotoMapping.filePreviews.set(files[i], URL.createObjectURL(files[i]));
    }

    renderPremiumPhotoMapping();

    const header = document.getElementById('photo-map-header');
    const subtitle = document.getElementById('photo-map-subtitle');

    if (files.length !== students.length) {
        header.className = 'photo-map-header warning';
        subtitle.innerHTML = `Has subido <strong>${files.length} fotos</strong> para <strong>${students.length} alumnos</strong>. Arrastra las fotos para alinearlas correctamente. Si faltan alumnos, usa el botón "Añadir Alumno".`;
    } else {
        header.className = 'photo-map-header';
        subtitle.innerHTML = `Arrastra las fotos arriba o abajo para hacerlas coincidir con los alumnos.`;
    }

    document.getElementById('modal-photo-map').classList.remove('hidden');
    e.target.value = ''; // Reset input
}

function renderPremiumPhotoMapping() {
    const studentsCol = document.getElementById('map-students-col');
    const photosCol = document.getElementById('map-photos-col');
    
    studentsCol.innerHTML = '';
    photosCol.innerHTML = '';

    const maxLen = Math.max(currentPhotoMapping.students.length, currentPhotoMapping.files.length);
    const multiClase = state.currentClasses.length > 1;

    for(let i=0; i<maxLen; i++) {
        const student = currentPhotoMapping.students[i];
        
        // Render Student Slot (Left)
        const sDiv = document.createElement('div');
        sDiv.className = 'mapping-slot student-slot';
        if (student) {
            sDiv.innerHTML = `<span><strong>${i+1}.</strong> ${(student.nombre + ' ' + (student.apellidos || '')).trim()}</span> 
                             ${multiClase ? `<span class="badge">${student._grupoOriginal}</span>` : ''}`;
        } else {
            sDiv.className = 'mapping-slot empty-slot';
            sDiv.innerHTML = `(Sin Alumno - Foto sobrante)`;
        }
        studentsCol.append(sDiv);

        // Render Photo Slot (Right)
        const file = currentPhotoMapping.files[i];
        const pDiv = document.createElement('div');
        pDiv.dataset.index = i;
        if (file) {
            pDiv.className = 'mapping-slot photo-slot';
            pDiv.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="#94a3b8" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <img src="${currentPhotoMapping.filePreviews.get(file)}" class="photo-slot-thumb">
                <span class="photo-slot-name" title="${file.name}">${file.name}</span>
            `;
        } else {
            pDiv.className = 'mapping-slot empty-slot';
            pDiv.innerHTML = `(Arrastra una foto aquí)`;
        }
        photosCol.append(pDiv);
    }

    // Initialize Sortable
    if(currentPhotoMapping.sortableInst) currentPhotoMapping.sortableInst.destroy();
    
    currentPhotoMapping.sortableInst = new Sortable(photosCol, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const itemEl = currentPhotoMapping.files.splice(evt.oldIndex, 1)[0];
            currentPhotoMapping.files.splice(evt.newIndex, 0, itemEl);
            renderPremiumPhotoMapping(); // Re-render to sync colors and empty slots
        }
    });
}

function handleAddMissingStudent() {
    // Quick prompt for student name
    const raw = prompt("Introduce el nombre del alumno faltante (Ej: Apellidos, Nombre):");
    if(!raw) return;
    
    let nombre = raw, apellidos = "";
    if (raw.includes(',')) {
        const parts = raw.split(',');
        apellidos = parts[0].trim();
        nombre = parts[1].trim();
    } else {
        const parts = raw.split(' ');
        nombre = parts[0].trim();
        apellidos = parts.slice(1).join(' ').trim();
    }
    
    const clase = state.currentClasses[0]; // Fallback al primero seleccionado
    if(!clase) return;
    
    const generateSafeId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    };
    
    const newStudent = {
        id: generateSafeId(),
        nombre: nombre,
        apellidos: apellidos,
        _grupoOriginal: clase
    };
    
    // Lo añadimos al estado REAL para que persista
    if (!state.classes[clase]) state.classes[clase] = [];
    state.classes[clase].push({
        id: newStudent.id,
        nombre: newStudent.nombre,
        apellidos: newStudent.apellidos
    });
    saveState();
    
    // Lo añadimos al mapping actual
    currentPhotoMapping.students.push(newStudent);
    
    // Re-ordenamos alfabéticamente para mantener el rigor
    currentPhotoMapping.students.sort((a, b) => {
        const nameA = ((a.apellidos || '') + ' ' + a.nombre).toLowerCase().trim();
        const nameB = ((b.apellidos || '') + ' ' + b.nombre).toLowerCase().trim();
        return nameA.localeCompare(nameB);
    });
    
    // Ajustar longitud de files con nulls si es necesario
    while(currentPhotoMapping.files.length < currentPhotoMapping.students.length) {
        currentPhotoMapping.files.push(null);
    }
    
    renderPremiumPhotoMapping();
}

// Ensure elements exist before binding
const btnConfirmMap = document.getElementById('btn-confirm-map');
if(btnConfirmMap) {
    btnConfirmMap.addEventListener('click', async () => {
        document.getElementById('modal-photo-map').classList.add('hidden');
        dom.photoLoading.classList.remove('hidden');
        
        const promises = [];
        currentPhotoMapping.students.forEach((student, i) => {
            const file = currentPhotoMapping.files[i];
            if (file) {
                promises.push(new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                        try { await localforage.setItem(student.id, evt.target.result); resolve(); }
                        catch (err) { reject(err); }
                    };
                    reader.onerror = () => reject(new Error(`Error leyendo ${file.name}`));
                    reader.readAsDataURL(file);
                }));
            }
        });
        
        try {
            await Promise.all(promises);
            showToast(`Fotos asignadas correctamente.`, 'success');
            renderStudents();
        } catch (e) {
            showToast('Error asignando algunas fotos.', 'error');
            console.error(e);
        } finally {
            dom.photoLoading.classList.add('hidden');
            Array.from(currentPhotoMapping.filePreviews.values()).forEach(URL.revokeObjectURL);
            currentPhotoMapping.filePreviews = new Map();
        }
    });
}

// =========================================================
// RENDERIZAR LISTA DE ALUMNOS
// B6 FIXED: copia spread para no mutar objetos del estado
// MP1 FIXED: addEventListener en lugar de onclick inline
// MP2 FIXED: clases CSS en lugar de estilos inline
// =========================================================
async function renderStudents() {
    dom.studentsList.innerHTML = '';

    // B6: { ...s } evita mutar el objeto original del estado
    const students = [];
    state.currentClasses.forEach(c => {
        if (state.classes[c]) {
            state.classes[c].forEach(s => students.push({ ...s, _grupoOriginal: c }));
        }
    });

    // Ordenar combinados alfabéticamente por apellidos
    students.sort((a, b) => {
        const nameA = ((a.apellidos || '') + ' ' + a.nombre).toLowerCase().trim();
        const nameB = ((b.apellidos || '') + ' ' + b.nombre).toLowerCase().trim();
        return nameA.localeCompare(nameB);
    });

    for (const student of students) {
        const li = document.createElement('li');
        li.className = 'student-item';
        li.dataset.id = student.id;

        const photoData = await localforage.getItem(student.id);
        const photoEl = photoData
            ? `<img src="${photoData}" class="student-photo" alt="Foto de ${student.nombre}">`
            : `<div class="student-photo student-photo-empty">Sin foto</div>`;

        const multiClase = state.currentClasses.length > 1;

        li.innerHTML = `
            <div class="student-drag-handle" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="8" y1="6"  x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6"  x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
            </div>
            ${photoEl}
            <div class="student-info">
                <div class="student-name">${(student.nombre + ' ' + (student.apellidos || '')).trim()}</div>
                ${multiClase ? `<div class="student-group-badge">${student._grupoOriginal}</div>` : ''}
            </div>
            <div class="student-actions">
                <input type="text" class="aka-input" placeholder="Alias…" value="${student.aka || ''}" aria-label="Alias de ${student.nombre}">
                <button class="icon-action-btn edit-student-btn"   title="Editar"   aria-label="Editar ${student.nombre}">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-action-btn delete-student-btn" title="Eliminar" aria-label="Eliminar ${student.nombre}">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        // MP1: Event listeners, no inline onclick
        li.querySelector('.aka-input').addEventListener('change', (e) => {
            // B6: modificamos el objeto ORIGINAL en state.classes, no la copia
            const cls = state.classes[student._grupoOriginal];
            const orig = cls?.find(s => s.id === student.id);
            if (orig) {
                orig.aka = e.target.value.trim();
                saveState();
                showAkaSavedFeedback(e.target); // U2
            }
        });

        li.querySelector('.edit-student-btn').addEventListener('click', () =>
            openEditModal(student.id, student._grupoOriginal)
        );
        li.querySelector('.delete-student-btn').addEventListener('click', () =>
            deleteStudent(student.id, student._grupoOriginal)
        );

        dom.studentsList.appendChild(li);
    }
}

// U2: Feedback visual al guardar alias
function showAkaSavedFeedback(inputEl) {
    inputEl.classList.add('aka-saved');
    setTimeout(() => inputEl.classList.remove('aka-saved'), 1500);
}

// =========================================================
// EDICIÓN Y ELIMINACIÓN
// =========================================================
async function deleteStudent(studentId, className) {
    const ok = await showConfirm('¿Seguro que quieres eliminar a este alumno?');
    if (!ok) return;
    state.classes[className] = state.classes[className].filter(s => s.id !== studentId);
    await localforage.removeItem(studentId);
    saveState();
    renderStudents();
    showToast('Alumno eliminado.', 'success');
}

function openEditModal(studentId, className) {
    const student = state.classes[className]?.find(s => s.id === studentId);
    if (!student) return;

    dom.editStudentId.value  = student.id;
    dom.editNombre.value     = student.nombre;
    dom.editApellidos.value  = student.apellidos;
    dom.editAka.value        = student.aka || '';
    dom.editPhoto.value      = '';
    dom.editPhotoPreview.classList.add('hidden');

    // U5: mostrar foto actual
    localforage.getItem(studentId).then(photoData => {
        if (photoData) {
            dom.editPhotoPreview.src = photoData;
            dom.editPhotoPreview.classList.remove('hidden');
        }
    });

    dom.editModal.classList.remove('hidden');
    dom.editNombre.focus();
}

function closeEditModal() {
    dom.editModal.classList.add('hidden');
    dom.editForm.reset();
    dom.editPhotoPreview.classList.add('hidden');
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const id = dom.editStudentId.value;

    let student = null;
    for (const c of state.currentClasses) {
        student = state.classes[c]?.find(s => s.id === id);
        if (student) break;
    }
    if (!student) return;

    student.nombre    = dom.editNombre.value.trim();
    student.apellidos = dom.editApellidos.value.trim();
    student.aka       = dom.editAka.value.trim();

    const file = dom.editPhoto.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
            await localforage.setItem(id, evt.target.result);
            finishEdit();
        };
        reader.readAsDataURL(file);
    } else {
        finishEdit();
    }
}

function finishEdit() {
    saveState();
    closeEditModal();
    renderStudents();
    showToast('Cambios guardados.', 'success');
}

// =========================================================
// JUEGO
// =========================================================
async function startGame(mode) {
    const students = getAllGameStudents();

    // U8: validar mínimo de alumnos antes de iniciar
    if (students.length === 0) {
        showToast('No hay alumnos en las clases seleccionadas.', 'warning');
        return;
    }
    if ((mode === 'quiz' || mode === 'timeattack') && students.length < 4) {
        showToast('Necesitas al menos 4 alumnos para el modo Quiz.', 'warning');
        return;
    }

    // Limpiar timers anteriores (B8)
    clearInterval(state.timer);
    state.timer = null;
    if (state.classicTimeout) { clearTimeout(state.classicTimeout); state.classicTimeout = null; }

    state.gameData        = [...students].sort(() => Math.random() - 0.5);
    state.currentGameMode = mode;
    state.gameIndex       = 0;
    state.score           = 0;

    switchScreen('game');

    if (mode === 'timeattack') {
        state.timeLeft = 60;
        dom.gameTime.classList.remove('hidden');
        dom.gameScore.classList.remove('hidden');
        startTimer();
    } else {
        dom.gameTime.classList.add('hidden');
        dom.gameScore.classList.add('hidden');
    }

    renderGameCard();
}

function startTimer() {
    clearInterval(state.timer);
    dom.gameTime.textContent = formatTime(state.timeLeft);
    state.timer = setInterval(() => {
        state.timeLeft--;
        dom.gameTime.textContent = formatTime(state.timeLeft);
        if (state.timeLeft <= 0) {
            clearInterval(state.timer);
            state.timer = null;
            endGame();
        }
    }, 1000);
}

function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function buildEndScreen(title) {
    dom.gameArea.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'game-end-screen';
    wrap.innerHTML = `
        <h2>${title}</h2>
        ${state.score > 0 ? `<p class="game-final-score">Puntuación: <strong>${state.score}</strong></p>` : ''}
    `;
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = 'Volver';
    btn.addEventListener('click', exitGame);
    wrap.appendChild(btn);
    dom.gameArea.appendChild(wrap);
}

function endGame() { buildEndScreen('¡Tiempo terminado!'); }

async function renderGameCard() {
    if (state.gameIndex >= state.gameData.length) {
        if (state.currentGameMode === 'timeattack') {
            state.gameData = [...state.gameData].sort(() => Math.random() - 0.5);
            state.gameIndex = 0;
        } else {
            buildEndScreen('¡Fin de la partida!');
            return;
        }
    }

    dom.gameProgress.textContent = `${state.gameIndex + 1} / ${state.gameData.length}`;
    dom.gameScore.textContent    = `Puntos: ${state.score}`;

    const student    = state.gameData[state.gameIndex];
    const photoData  = await localforage.getItem(student.id);
    const PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="%23e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" fill="%23999" font-size="14">Sin Foto</text></svg>`;
    const imgSrc     = photoData || PLACEHOLDER;
    const realName   = (student.nombre + ' ' + (student.apellidos || '')).trim();
    const displayName = student.aka ? `${student.aka} (${realName})` : realName;
    const typingTarget = student.aka ? student.aka.toLowerCase() : realName.toLowerCase();

    dom.gameArea.innerHTML = '';

    // --- MODO CLÁSICO ---
    if (state.currentGameMode === 'classic') {
        const wrapper = document.createElement('div');
        wrapper.className = 'flashcard-wrapper';
        wrapper.setAttribute('role', 'button');
        wrapper.setAttribute('aria-label', 'Voltear tarjeta');
        wrapper.setAttribute('tabindex', '0');
        wrapper.innerHTML = `
            <div class="flashcard-inner">
                <div class="flashcard-front">
                    <img src="${imgSrc}" alt="Foto del alumno">
                    <span class="card-hint">Toca para ver el nombre</span>
                </div>
                <div class="flashcard-back">
                    <h2>${displayName}</h2>
                    <span class="card-hint">Siguiente →</span>
                </div>
            </div>
        `;

        let advanced = false; // B3: bandera para evitar doble avance
        const advance = () => {
            if (advanced) return;
            advanced = true;
            if (state.classicTimeout) { clearTimeout(state.classicTimeout); state.classicTimeout = null; }
            state.gameIndex++;
            renderGameCard();
        };

        wrapper.addEventListener('click', () => {
            if (!wrapper.classList.contains('flipped')) {
                wrapper.classList.add('flipped');
                state.classicTimeout = setTimeout(advance, 2000); // B3: guardamos ref
            }
        });
        wrapper.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrapper.click(); } });

        dom.gameArea.appendChild(wrapper);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn secondary';
        nextBtn.style.marginTop = '1.5rem';
        nextBtn.textContent = 'Siguiente →';
        nextBtn.addEventListener('click', advance); // B3: misma fn, cancela el timeout
        dom.gameArea.appendChild(nextBtn);

    // --- MODO QUIZ / CONTRARRELOJ ---
    } else if (state.currentGameMode === 'quiz' || state.currentGameMode === 'timeattack') {
        const img = document.createElement('img');
        img.src       = imgSrc;
        img.className = 'game-photo';
        img.alt       = 'Alumno';
        dom.gameArea.appendChild(img);

        const allStudents = getAllGameStudents();
        const pool = allStudents
            .filter(s => s.id !== student.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
        const options = [...pool, student].sort(() => Math.random() - 0.5);

        const grid = document.createElement('div');
        grid.className = 'quiz-options';

        let answered = false;
        let correctBtn = null; // B4: referencia directa al botón correcto

        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-btn';
            const optName = opt.aka
                ? `${opt.aka} (${(opt.nombre + ' ' + (opt.apellidos || '')).trim()})`
                : (opt.nombre + ' ' + (opt.apellidos || '')).trim();
            // U7: mostrar atajo de teclado
            btn.innerHTML = `<span class="quiz-key-hint">${idx + 1}</span>${optName}`;

            if (opt.id === student.id) correctBtn = btn; // B4: guardamos referencia

            btn.addEventListener('click', () => {
                if (answered) return;
                answered = true;

                if (opt.id === student.id) {
                    btn.classList.add('correct');
                    state.score += 10;
                    setTimeout(() => { state.gameIndex++; renderGameCard(); }, 500);
                } else {
                    btn.classList.add('wrong');
                    if (correctBtn) correctBtn.classList.add('correct'); // B4: marcamos por referencia directa
                    if (state.currentGameMode === 'timeattack') {
                        state.timeLeft = Math.max(0, state.timeLeft - 3);
                    }
                    setTimeout(() => { state.gameIndex++; renderGameCard(); }, 1500);
                }
            });
            grid.appendChild(btn);
        });
        dom.gameArea.appendChild(grid);

    // --- MODO ESCRITURA ---
    } else if (state.currentGameMode === 'typing') {
        const img = document.createElement('img');
        img.src       = imgSrc;
        img.className = 'game-photo';
        img.alt       = 'Alumno';
        dom.gameArea.appendChild(img);

        const form     = document.createElement('form');
        form.className = 'typing-form';

        const input = document.createElement('input');
        input.type         = 'text';
        input.className    = 'typing-input';
        input.placeholder  = 'Escribe el nombre y/o apellidos…';
        input.autocomplete = 'off';

        const submitBtn = document.createElement('button');
        submitBtn.type      = 'submit';
        submitBtn.className = 'btn primary';
        submitBtn.textContent = 'Comprobar';

        const feedback = document.createElement('p');
        feedback.className = 'typing-feedback';

        form.append(input, submitBtn, feedback);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const guess = input.value.trim().toLowerCase();
            if (!guess) return; // B7: guard contra vacío

            const realLower = realName.toLowerCase();
            // B7: paréntesis explícitos para precedencia clara
            const isCorrect = (guess === typingTarget) ||
                              (guess === realLower) ||
                              (guess.length > 3 && realLower.includes(guess));

            if (isCorrect) {
                feedback.textContent   = '¡Correcto!';
                feedback.style.color   = 'var(--success)';
                feedback.style.fontWeight = '600';
                submitBtn.disabled = true;
                setTimeout(() => { state.gameIndex++; renderGameCard(); }, 1000);
            } else {
                feedback.innerHTML     = `Incorrecto. Era: <strong>${displayName}</strong>`;
                feedback.style.color   = 'var(--danger)';
                input.value            = displayName;
                submitBtn.disabled     = true;
                setTimeout(() => { state.gameIndex++; renderGameCard(); }, 2000);
            }
        });

        dom.gameArea.appendChild(form);
        setTimeout(() => input.focus(), 80);
    }
}

// U7: Atajos de teclado en el juego
function handleKeyboardShortcuts(e) {
    if (screens.game.classList.contains('hidden')) return;

    // Quiz/Contrarreloj: teclas 1-4
    if (state.currentGameMode === 'quiz' || state.currentGameMode === 'timeattack') {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < 4) {
            const btns = document.querySelectorAll('.quiz-btn');
            if (btns[idx]) btns[idx].click();
        }
    }

    // Clásico: Espacio voltea
    if (state.currentGameMode === 'classic' && e.key === ' ') {
        e.preventDefault();
        const wrapper = document.querySelector('.flashcard-wrapper');
        if (wrapper && !wrapper.classList.contains('flipped')) wrapper.click();
    }
}

// =========================================================
// ARRANQUE
// =========================================================
init();


function autoGroupClasses(classesArray) {
    const groups = {};
    classesArray.forEach(c => {
        let group = c;
        const match = c.match(/^(\d+)/);
        if (match) {
            const num = match[1];
            const rest = c.substring(num.length).toUpperCase();
            let stage = rest;
            if (rest.startsWith('E') || rest.includes('DIV') || rest.includes('PMAR')) stage = 'ESO';
            else if (rest.startsWith('B')) stage = 'BACH';
            else stage = 'FP';
            group = num + '_' + stage;
        } else {
            group = 'OTHER';
        }
        if (!groups[group]) groups[group] = [];
        groups[group].push(c);
    });

    const stageOrder = { 'ESO': 1, 'BACH': 2, 'FP': 3, 'OTHER': 4 };
    const sortedGroups = Object.keys(groups).sort((a, b) => {
        const [numA, stageA] = a.split('_');
        const [numB, stageB] = b.split('_');
        const weightA = (stageOrder[stageA] || 99) * 100 + parseInt(numA || 0);
        const weightB = (stageOrder[stageB] || 99) * 100 + parseInt(numB || 0);
        return weightA - weightB;
    });

    const rows = [];
    sortedGroups.forEach(gKey => {
        rows.push(groups[gKey].sort());
    });
    return rows;
}

// =========================================================
// BACKUP & RESTORE
// =========================================================
async function exportBackup() {
    showToast('Preparando backup (puede tardar unos segundos)…', 'info', 5000);

    const backup = {
        version: 2,
        exportDate: new Date().toISOString(),
        classes: state.classes,
        classRows: state.classRows,
        theme: state.theme,
        photos: {}
    };

    // Collect all student IDs across all classes
    const allIds = [];
    Object.values(state.classes).forEach(arr => arr.forEach(s => allIds.push(s.id)));

    // Read each photo from localforage
    await Promise.all(allIds.map(async (id) => {
        try {
            const data = await localforage.getItem(id);
            if (data) backup.photos[id] = data; // already base64 dataURL
        } catch (e) { /* skip */ }
    }));

    const json = JSON.stringify(backup);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alumnos_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Backup exportado (${(json.length / 1024).toFixed(0)} KB)`, 'success');
}

async function importBackup(file) {
    const ok = await showConfirm('⚠️ Restaurar el backup sobreescribirá TODOS los datos actuales (alumnos y fotos). ¿Continuar?');
    if (!ok) return;

    showToast('Restaurando backup…', 'info', 8000);
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const backup = JSON.parse(evt.target.result);

            if (!backup.classes) throw new Error('Formato de backup no reconocido.');

            // Restore state
            state.classes = backup.classes;
            state.classRows = backup.classRows || autoGroupClasses(Object.keys(backup.classes));
            if (backup.theme) {
                state.theme = backup.theme;
                document.documentElement.setAttribute('data-theme', state.theme);
                const sel = document.getElementById('theme-selector');
                if (sel) sel.value = state.theme;
                try { localStorage.setItem('flashcards_theme', state.theme); } catch(e){}
            }
            saveState();

            // Restore photos
            if (backup.photos) {
                const ids = Object.keys(backup.photos);
                await Promise.all(ids.map(id => localforage.setItem(id, backup.photos[id])));
            }

            renderClasses();
            const total = Object.values(state.classes).reduce((s, a) => s + a.length, 0);
            showToast(`Backup restaurado: ${Object.keys(state.classes).length} clases, ${total} alumnos.`, 'success');
        } catch (e) {
            showToast('Error al restaurar. El archivo no es un backup válido.', 'error');
            console.error(e);
        }
    };
    reader.readAsText(file);
}

// AGENDA LOGIC
function renderAgenda() {
    const list = document.getElementById('agenda-list');
    if(!list) return;
    list.innerHTML = '';
    
    let students = [];
    state.currentClasses.forEach(c => {
        if (state.classes[c]) {
            state.classes[c].forEach(s => students.push({...s, _grupoOriginal: c}));
        }
    });
    
    students.sort((a, b) => {
        const nameA = ((a.apellidos || '') + ' ' + a.nombre).toLowerCase().trim();
        const nameB = ((b.apellidos || '') + ' ' + b.nombre).toLowerCase().trim();
        return nameA.localeCompare(nameB);
    });
    
    if (students.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding: 2rem; color: #94a3b8;">No hay alumnos en la clase seleccionada.</div>';
        return;
    }

    const icons = {
        user: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        phone: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
        mail: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
        home: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>'
    };
    
    students.forEach(s => {
        const card = document.createElement('div');
        card.className = 'agenda-card';
        
        let t1 = s.tutor1 || {};
        let t2 = s.tutor2 || {};
        
        card.innerHTML = `
            <div class="agenda-col" style="border-right: 1px solid #f1f5f9; padding-right: 1rem;">
                <h3 style="margin:0 0 0.5rem 0; color: var(--primary); font-size: 1.1rem; line-height: 1.2;">
                    ${s.apellidos ? s.apellidos + ', ' : ''}${s.nombre}
                </h3>
                <div style="margin-bottom: 0.5rem;"><span class="badge" style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 4px 8px; border-radius: 12px; font-weight: 600;">${s._grupoOriginal}</span></div>
                <p class="agenda-value">${icons.phone} ${s.telefonos || '<span style="color:#cbd5e1;">-</span>'}</p>
                <p class="agenda-value">${icons.mail} ${s.correoEducacyl || '<span style="color:#cbd5e1;">-</span>'}</p>
                <p class="agenda-value">${icons.home} ${s.municipio || '<span style="color:#cbd5e1;">-</span>'}</p>
            </div>
            <div class="agenda-col">
                <p class="agenda-title">Tutor 1</p>
                <p class="agenda-value" style="font-weight: 500;">${icons.user} ${t1.nombre || '<span style="color:#cbd5e1;">Sin registrar</span>'}</p>
                <p class="agenda-value">${icons.phone} ${t1.telefonos || '<span style="color:#cbd5e1;">-</span>'}</p>
                <p class="agenda-value">${icons.mail} ${t1.email || '<span style="color:#cbd5e1;">-</span>'}</p>
            </div>
            <div class="agenda-col">
                <p class="agenda-title">Tutor 2</p>
                <p class="agenda-value" style="font-weight: 500;">${icons.user} ${t2.nombre || '<span style="color:#cbd5e1;">Sin registrar</span>'}</p>
                <p class="agenda-value">${icons.phone} ${t2.telefonos || '<span style="color:#cbd5e1;">-</span>'}</p>
                <p class="agenda-value">${icons.mail} ${t2.email || '<span style="color:#cbd5e1;">-</span>'}</p>
            </div>
        `;
        
        card.dataset.search = (
            (s.nombre||'') + ' ' + (s.apellidos||'') + ' ' + 
            (s.telefonos||'') + ' ' + (s.correoEducacyl||'') + ' ' + 
            (t1.nombre||'') + ' ' + (t1.telefonos||'') + ' ' + (t1.email||'') + ' ' +
            (t2.nombre||'') + ' ' + (t2.telefonos||'') + ' ' + (t2.email||'')
        ).toLowerCase();
        
        list.appendChild(card);
    });
}

// Agenda event listeners — called from init() after DOM is ready
function initAgenda() {
    const btnAgenda = document.getElementById('btn-open-agenda');
    if (btnAgenda) {
        btnAgenda.addEventListener('click', () => {
            renderAgenda();
            document.getElementById('modal-agenda').classList.remove('hidden');
            document.getElementById('agenda-search').value = '';
            document.getElementById('agenda-search').focus();
        });
    }

    const agendaSearch = document.getElementById('agenda-search');
    if (agendaSearch) {
        agendaSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.agenda-card').forEach(card => {
                card.style.display = card.dataset.search.includes(query) ? 'grid' : 'none';
            });
        });
    }
}

// Backup event listeners — called from init()
function initBackup() {
    const btnExport = document.getElementById('btn-export-backup');
    if (btnExport) {
        btnExport.addEventListener('click', exportBackup);
    }

    const backupInput = document.getElementById('backup-upload');
    if (backupInput) {
        backupInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importBackup(file);
                e.target.value = '';
            }
        });
    }
}
