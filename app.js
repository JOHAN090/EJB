document.addEventListener('DOMContentLoaded', () => {
    // === Gestión del Estado (State Management) ===
    const estado = { usuarioActual: null };
    
    // Materias Requeridas para Egreso
    const MATERIAS_REQUERIDAS = ["MAT-101", "FIS-102", "MAT-102", "PROG-101"];

    // === Elementos del DOM ===
    const vistas = {
        login: document.getElementById('vista-login'),
        panel: document.getElementById('vista-panel'),
        inscripcion: document.getElementById('vista-inscripcion'),
        exitoInscripcion: document.getElementById('vista-exito-inscripcion'),
        egreso: document.getElementById('vista-egreso')
    };

    const contenedorNotificacion = document.getElementById('contenedor-notificacion');
    const infoUsuario = document.getElementById('info-usuario');
    const textoNombreUsuario = document.getElementById('texto-nombre-usuario');

    // === Ayudantes de Navegación (Helpers) ===
    const mostrarVista = (nombreVista) => {
        Object.values(vistas).forEach(v => v.classList.add('oculto'));
        if(vistas[nombreVista]) vistas[nombreVista].classList.remove('oculto');
        ocultarNotificacion();
    };

    const mostrarNotificacion = (mensaje, tipo = 'error') => {
        contenedorNotificacion.textContent = mensaje;
        contenedorNotificacion.className = `notificacion ${tipo}`;
        contenedorNotificacion.classList.remove('oculto');
    };

    const ocultarNotificacion = () => contenedorNotificacion.classList.add('oculto');

    // Manejo de botones para volver atrás
    document.querySelectorAll('.btn-volver').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const destinoVista = e.target.getAttribute('data-destino');
            
            // Limpiar formularios si se regresa al panel (dashboard)
            if(destinoVista === 'vista-panel') {
                document.getElementById('select-semestre').value = '';
                document.getElementById('contenedor-materias').classList.add('oculto');
                document.getElementById('btn-confirmar-inscripcion').disabled = true;
                
                // Limpiar etiquetas añadidas por validación del tesoro
                document.querySelectorAll('.check-folder').forEach(chk => {
                    const span = chk.nextElementSibling;
                    span.innerHTML = span.innerHTML.replace(/<span.*<\/span>/, '').trim();
                });
            }
            mostrarVista(destinoVista.replace('vista-', '')); 
        });
    });

    // === Flujo 1: Iniciar Sesión (Login) ===
    document.getElementById('formulario-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const matricula = document.getElementById('input-matricula').value.trim();
        const ci = document.getElementById('input-ci').value.trim();

        try {
            // Peticiones asíncronas cruzadas al backend simulado (ahora usa nombres en español)
            const [respuestaEstudiantes, respuestaKardex] = await Promise.all([
                fetch('estudiantes.json'), fetch('kardex.json')
            ]);
            
            if(!respuestaEstudiantes.ok || !respuestaKardex.ok) throw new Error("Fallo en la petición JSON");
            
            const estudiantes = await respuestaEstudiantes.json();
            const kardex = await respuestaKardex.json();
            
            // Validar credenciales
            const usuario = estudiantes.find(e => e.matricula === matricula && e.carnet_identidad === ci);
            if (!usuario) return mostrarNotificacion('Credenciales incorrectas o usuario no encontrado.');
            
            // Validar estado de matrícula
            if (!usuario.cuenta_activa || !usuario.matricula_vigente) return mostrarNotificacion('Cuenta inactiva o matrícula no vigente. Pase por Kardex.', 'error');

            // Asociar historial académico al estado del usuario
            const historialUsuario = kardex.find(k => k.matricula === matricula) || { materias_aprobadas: [] };
            estado.usuarioActual = { ...usuario, historial: historialUsuario };
            
            infoUsuario.classList.remove('oculto');
            textoNombreUsuario.textContent = `Estudiante: ${usuario.nombre}`;
            mostrarVista('panel');
        } catch (error) {
            mostrarNotificacion('Error de conexión con el servidor local.');
        }
    });

    // Cerrar sesión
    document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
        estado.usuarioActual = null;
        infoUsuario.classList.add('oculto');
        document.getElementById('formulario-login').reset();
        mostrarVista('login');
    });

    // === Menú Principal (Dashboard) ===
    document.getElementById('btn-menu-inscripcion').addEventListener('click', () => mostrarVista('inscripcion'));
    document.getElementById('btn-menu-egreso').addEventListener('click', () => { 
        mostrarVista('egreso'); 
        iniciarFlujoEgreso(); 
    });

    // === Flujo 1: Lógica de Inscripción ===
    const selectSemestre = document.getElementById('select-semestre');
    const contenedorMaterias = document.getElementById('contenedor-materias');
    const cuerpoTablaMaterias = document.getElementById('cuerpo-tabla-materias');
    const btnConfirmarInscripcion = document.getElementById('btn-confirmar-inscripcion');

    selectSemestre.addEventListener('change', async (e) => {
        const semestre = e.target.value;
        if (!semestre) return contenedorMaterias.classList.add('oculto');

        try {
            const respuestaMaterias = await fetch('materias.json');
            const todasLasMaterias = await respuestaMaterias.json();
            const listaMaterias = todasLasMaterias[semestre] || [];

            const materiasAprobadas = estado.usuarioActual.historial.materias_aprobadas || [];
            
            // Filtro estricto según avance académico
            const materiasDisponibles = listaMaterias.filter(materia => {
                if(materiasAprobadas.includes(materia.id)) return false; // Ya fue aprobada
                if(!materia.prerrequisitos) return true;
                // Exige que TODOS los prerrequisitos estén aprobados
                return materia.prerrequisitos.every(pr => materiasAprobadas.includes(pr)); 
            });

            if (materiasDisponibles.length > 0) {
                renderizarMaterias(materiasDisponibles);
                contenedorMaterias.classList.remove('oculto');
            } else {
                cuerpoTablaMaterias.innerHTML = '<tr><td colspan="4" style="text-align:center;" data-testid="mensaje-sin-materias">No existen materias habilitadas para tu avance académico en este semestre.</td></tr>';
                btnConfirmarInscripcion.disabled = true;
                contenedorMaterias.classList.remove('oculto');
            }
        } catch(error) {
            mostrarNotificacion('Error al cargar la oferta de materias.');
        }
    });

    function renderizarMaterias(listaMaterias) {
        cuerpoTablaMaterias.innerHTML = '';
        btnConfirmarInscripcion.disabled = true;

        listaMaterias.forEach(materia => {
            const fila = document.createElement('tr');
            const opcionesParalelo = materia.paralelos.map(p => `<option value="${p.id}">${p.id} - ${p.horario}</option>`).join('');
            fila.innerHTML = `
                <td><input type="checkbox" class="checkbox-materia" data-testid="checkbox-${materia.id}" data-materia="${materia.id}" data-nombre="${materia.nombre}"></td>
                <td><strong>${materia.id}</strong></td>
                <td>${materia.nombre}</td>
                <td><select class="select-paralelo" disabled data-testid="select-${materia.id}">${opcionesParalelo}</select></td>
            `;
            cuerpoTablaMaterias.appendChild(fila);
        });

        // Habilitar selección de paralelo solo si el checkbox está marcado
        document.querySelectorAll('.checkbox-materia').forEach(chk => {
            chk.addEventListener('change', (e) => {
                e.target.closest('tr').querySelector('.select-paralelo').disabled = !e.target.checked;
                btnConfirmarInscripcion.disabled = document.querySelectorAll('.checkbox-materia:checked').length === 0;
            });
        });
    }

    btnConfirmarInscripcion.addEventListener('click', () => {
        // Recopilar materias seleccionadas
        const materiasSeleccionadas = Array.from(document.querySelectorAll('.checkbox-materia:checked')).map(chk => {
            const select = chk.closest('tr').querySelector('.select-paralelo');
            return {
                id: chk.dataset.materia, 
                nombre: chk.dataset.nombre,
                paralelo: select.value, 
                horario: select.options[select.selectedIndex].text.split(' - ')[1]
            };
        });

        // Generar boleta
        const htmlBoleta = `
            <p><strong>Estudiante:</strong> ${estado.usuarioActual.nombre}</p>
            <p><strong>Matrícula:</strong> ${estado.usuarioActual.matricula}</p>
            <hr style="margin: 15px 0;">
            <h4>Materias Inscritas:</h4><ul>
            ${materiasSeleccionadas.map(m => `<li>✅ <strong>${m.id}</strong> - ${m.nombre} (Par. ${m.paralelo}) <br><small>📅 ${m.horario}</small></li>`).join('')}
            </ul>`;
        
        document.getElementById('detalles-boleta').innerHTML = htmlBoleta;
        mostrarVista('exitoInscripcion');
    });

    // === Flujo 2: Lógica de Trámite de Egreso ===
    const contenedorEstadoSSA = document.getElementById('contenedor-validacion-ssa');
    const contenedorChecklist = document.getElementById('contenedor-checklist-kardex');
    const contenedorProcesamiento = document.getElementById('contenedor-procesamiento-kardex');
    const btnEnviarKardex = document.getElementById('btn-enviar-kardex');
    const checksFolder = document.querySelectorAll('.check-folder');

    async function iniciarFlujoEgreso() {
        contenedorChecklist.classList.add('oculto');
        contenedorProcesamiento.classList.add('oculto');
        contenedorEstadoSSA.classList.remove('oculto');
        
        contenedorEstadoSSA.innerHTML = '<div class="cargador" data-testid="cargador-ssa"></div><h3 style="text-align:center;">Fase 1: Validación Académica (SSA)...</h3>';
        checksFolder.forEach(c => { c.checked = false; c.disabled = false; });
        btnEnviarKardex.disabled = true;

        try {
            // FASE 1: Validación Lógica del SSA (Récord académico)
            const respuestaKardex = await fetch('kardex.json');
            const datosKardex = await respuestaKardex.json();
            const historial = datosKardex.find(k => k.matricula === estado.usuarioActual.matricula);

            if(!historial) {
                contenedorEstadoSSA.innerHTML = '<div style="text-align:center; padding: 20px;" data-testid="mensaje-error-ssa"><h3 style="color: var(--rojo-error);">❌ Registro académico no encontrado</h3></div>';
                return;
            }
            
            const materiasFaltantes = MATERIAS_REQUERIDAS.filter(materia => !historial.materias_aprobadas.includes(materia));
            const requisitosFaltantes = [];
            
            if (!historial.idioma) requisitosFaltantes.push('Aprobar Examen de Suficiencia de Idioma');
            if (!historial.trabajo_social) requisitosFaltantes.push('Cumplir con el Trabajo Dirigido / Servicio Social');

            if (materiasFaltantes.length > 0 || requisitosFaltantes.length > 0) {
                // El SSA rechaza el trámite
                let htmlError = `<div style="text-align:center; padding: 20px;" data-testid="contenedor-error-ssa"><h3 style="color: var(--rojo-error); margin-bottom: 1rem;">❌ Fase 1 Rechazada: SSA</h3>
                <p>Faltan los siguientes requisitos académicos en su historial:</p><ul style="text-align:left; display:inline-block; margin: 0 auto; color: var(--rojo-error); font-weight: 500;">`;
                materiasFaltantes.forEach(m => htmlError += `<li>Debe aprobar la materia: ${m}</li>`);
                requisitosFaltantes.forEach(r => htmlError += `<li>${r}</li>`);
                htmlError += `</ul></div>`;
                contenedorEstadoSSA.innerHTML = htmlError;
            } else {
                // Éxito en SSA -> Pasa a Fase 2 (Lista de Verificación Física de Kardex)
                contenedorEstadoSSA.classList.add('oculto');
                contenedorChecklist.classList.remove('oculto');
                
                // Realizar cruce de información opcional para pre-validar datos del tesoro
                try {
                    const respuestaTesoro = await fetch('tesoro.json');
                    const datosTesoro = await respuestaTesoro.json();
                    const tesoro = datosTesoro.find(t => t.matricula === estado.usuarioActual.matricula);
                    
                    if(tesoro && tesoro.valores_comprados) {
                        checksFolder[0].checked = true;
                        checksFolder[0].disabled = true;
                        if(!checksFolder[0].nextElementSibling.innerHTML.includes('Validado')) checksFolder[0].nextElementSibling.innerHTML += ' <span style="color:var(--verde-exito); font-size:0.8rem;" data-testid="validacion-tesoro-1">(Validado por sistema)</span>';
                    }
                    if(tesoro && tesoro.certificado_pagado) {
                        checksFolder[3].checked = true;
                        checksFolder[3].disabled = true;
                        if(!checksFolder[3].nextElementSibling.innerHTML.includes('Validado')) checksFolder[3].nextElementSibling.innerHTML += ' <span style="color:var(--verde-exito); font-size:0.8rem;" data-testid="validacion-tesoro-2">(Validado por sistema)</span>';
                    }
                } catch(e) { console.warn("Servicio de Tesoro Universitario no disponible"); }
                
                validarRequisitosFolder();
            }
        } catch(e) {
            contenedorEstadoSSA.innerHTML = '<div style="text-align:center; padding: 20px;" data-testid="mensaje-error-ssa"><h3 style="color: var(--rojo-error);">❌ Error de conexión al sistema central</h3></div>';
        }
    }

    // Activar botón de entrega solo cuando todos los documentos físicos estén marcados
    function validarRequisitosFolder() {
        btnEnviarKardex.disabled = !Array.from(checksFolder).every(c => c.checked);
    }
    checksFolder.forEach(chk => chk.addEventListener('change', validarRequisitosFolder));

    // FASE 2: Procesamiento Físico en Kardex
    btnEnviarKardex.addEventListener('click', async () => {
        contenedorChecklist.classList.add('oculto');
        contenedorProcesamiento.classList.remove('oculto');
        
        const textoEstado = document.getElementById('texto-estado-kardex');
        textoEstado.innerHTML = 'Fase 2: Trámite en procesamiento físico por Kardex...';
        textoEstado.style.color = '';
        document.querySelector('.cargador').classList.remove('oculto');
        
        // Simular tiempo de revisión física de documentos + verificación de cajas
        setTimeout(async () => {
            document.querySelector('.cargador').classList.add('oculto');
            try {
                const respuestaTesoro = await fetch('tesoro.json');
                const datosTesoro = await respuestaTesoro.json();
                const tesoro = datosTesoro.find(t => t.matricula === estado.usuarioActual.matricula);

                if (!tesoro || !tesoro.valores_comprados || !tesoro.certificado_pagado) {
                    textoEstado.innerHTML = '❌ Fase 2 Rechazada: Kardex detectó que falta el pago de valores en cajas del Tesoro Universitario.';
                    textoEstado.style.color = 'var(--rojo-error)';
                } else {
                    textoEstado.innerHTML = '✅ ¡Fase 2 Completada! Certificado Académico Emitido Exitosamente 🎉<br><span style="font-size:1rem; color:var(--texto-oscuro); display:block; margin-top:10px;">La Unidad de Kardex ha validado tu folder y los comprobantes de caja.</span>';
                    textoEstado.style.color = 'var(--verde-exito)';
                }
            } catch(e) {
                textoEstado.innerHTML = '❌ Error al validar comprobantes del Tesoro.';
                textoEstado.style.color = 'var(--rojo-error)';
            }
        }, 1500);
    });
});
