// src/components/common/SetupModal.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { compressImage } from '../../services/utils';
import LazyImage from './LazyImage';
import {
  Apple,
  Camera,
  ChefHat,
  ChevronDown,
  CheckCircle,
  Hammer,
  Info,
  Lock,
  Pill,
  Rocket,
  Shirt,
  ShoppingCart
} from 'lucide-react';
import './SetupModal.css';

const logoPlaceholder = 'https://placehold.co/100x100/FFFFFF/4A5568?text=L';

const BUSINESS_RUBROS = [
  { id: 'food_service', label: 'Restaurante / Cocina', icon: ChefHat },
  { id: 'abarrotes', label: 'Abarrotes / Tienda', icon: ShoppingCart },
  { id: 'farmacia', label: 'Farmacia', icon: Pill },
  { id: 'verduleria/fruteria', label: 'Frutería / Verdulería', icon: Apple },
  { id: 'apparel', label: 'Ropa / Calzado', icon: Shirt },
  { id: 'hardware', label: 'Ferretería', icon: Hammer },
];

export default function SetupModal() {
  const handleSetup = useAppStore((state) => state.handleSetup);
  const licenseDetails = useAppStore((state) => state.licenseDetails);

  useEffect(() => {
    // Si la licencia NO permite todo ("*") y solo hay 1 rubro permitido...
    if (!isAllAllowed && allowedRubrosList.length === 1) {
      // ...lo seleccionamos automáticamente al cargar
      const rubroForzado = allowedRubrosList[0];
      setSelectedTypes([rubroForzado]);
    }
  }, [licenseDetails]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [logoPreview, setLogoPreview] = useState(logoPlaceholder);
  const [logoData, setLogoData] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [error, setError] = useState('');

  // Control del Acordeón: 'info' | 'type'
  const [activeSection, setActiveSection] = useState('info');

  // ============================================================
  // LÓGICA DE LICENCIA DINÁMICA (MEJORADA)
  // ============================================================
  
  // 1. Obtener configuración de features desde la licencia
  // Si no existen features (licencias viejas), asumimos defaults restrictivos (1 rubro, todos permitidos)
  const licenseFeatures = licenseDetails?.features || {};
  
  // 2. Definir límite máximo (Default 1 si no viene definido)
  const maxRubrosAllowed = licenseFeatures.max_rubros || 1;
  
  // 3. Definir rubros permitidos (Si es ["*"] o undefined, permite todos)
  const allowedRubrosList = licenseFeatures.allowed_rubros || ['*'];
  const isAllAllowed = allowedRubrosList.includes('*');

  // Validación del Paso 1 (Nombre obligatorio)
  const isStep1Complete = useMemo(() => name.trim().length > 0, [name]);

  const handleSectionToggle = (section) => {
    // Si intentan abrir la sección 2 sin completar la 1, no hacemos nada
    if (section === 'type' && !isStep1Complete) return; 
    setActiveSection(activeSection === section ? '' : section);
  };

  // --- LÓGICA DE SELECCIÓN CORREGIDA ---
  const handleTypeClick = (value) => {
    setError('');
    
    // VALIDACIÓN PREVIA: ¿La licencia permite este rubro específico?
    if (!isAllAllowed && !allowedRubrosList.includes(value)) {
        setError("Tu licencia no incluye acceso a este rubro específico.");
        return;
    }
    
    setSelectedTypes(prev => {
      // 1. Si ya está seleccionado, lo quitamos (Toggle Off)
      if (prev.includes(value)) {
        return prev.filter(t => t !== value);
      }

      // 2. Si el límite es 1, funciona como Radio Button (Reemplaza la selección anterior)
      if (maxRubrosAllowed === 1) {
        return [value];
      }

      // 3. Modo Multi: Si no hemos llegado al límite, agregamos (Checkbox behavior)
      if (prev.length < maxRubrosAllowed) {
        return [...prev, value];
      }
      
      // 4. Si excedió el límite en modo normal, mostramos error
      setError(`Tu licencia permite máximo ${maxRubrosAllowed} rubros.`);
      return prev;
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedFile = await compressImage(file);
        setLogoPreview(URL.createObjectURL(compressedFile));
        setLogoData(compressedFile);
      } catch (error) {
        console.error("Error imagen:", error);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (selectedTypes.length === 0) {
      setError('Debes seleccionar al menos un rubro para finalizar.');
      // Si están en el paso 1 y le dan Enter, nos aseguramos que vean el error del paso 2
      if (activeSection !== 'type') setActiveSection('type');
      return;
    }

    handleSetup({
      name,
      phone,
      address,
      logo: logoData,
      business_type: selectedTypes
    });
  };

  // Botón "Siguiente" dentro del Paso 1
  const handleContinue = (e) => {
    e.preventDefault(); 
    if (isStep1Complete) {
      setActiveSection('type');
    } else {
        // Feedback visual si intentan avanzar sin nombre
        const nameInput = document.getElementById('setup-name-input');
        if(nameInput) nameInput.focus();
    }
  };

  return (
    <div id="business-setup-modal" className="modal" style={{ display: 'flex' }}>
      <div className="modal-content setup-content">
        <div className="setup-header">
          <h2>Configura tu Negocio</h2>
          <p>Completa estos pasos para personalizar tu sistema.</p>
        </div>

        <form id="business-setup-form" onSubmit={handleSubmit}>
          
          {/* --- ACORDEÓN 1: INFORMACIÓN --- */}
          <div className={`accordion-item ${activeSection === 'info' ? 'open' : ''} ${isStep1Complete ? 'completed' : ''}`}>
            <div className="accordion-header" onClick={() => handleSectionToggle('info')}>
              <div className="header-title">
                <span className="step-number">1</span>
                <span>Información General</span>
              </div>
              <div className="header-status">
                {isStep1Complete && <CheckCircle size={20} className="icon-success" />}
                <ChevronDown size={20} className="icon-chevron" />
              </div>
            </div>

            {activeSection === 'info' && (
              <div className="accordion-body">
                <div className="form-group">
                  <label className="form-label">Nombre del Negocio *</label>
                  <input 
                    id="setup-name-input"
                    className="form-input" 
                    type="text" 
                    required
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Mi Tiendita" 
                    autoFocus 
                  />
                </div>

                <div className="form-row-split">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" type="tel"
                      value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej: 961..." />
                  </div>
                  <div className="form-group logo-group">
                    <label className="form-label">Logo</label>
                    <div className="mini-logo-upload">
                        <label htmlFor="logo-upload" className="logo-preview-wrapper">
                            <LazyImage src={logoPreview} alt="Logo" />
                            <div className="overlay"><Camera size={18} aria-hidden="true" /></div>
                        </label>
                        <input id="logo-upload" type="file" accept="image/*" 
                            onChange={handleImageChange} style={{display:'none'}} />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <textarea className="form-textarea" rows="2"
                    value={address} onChange={(e) => setAddress(e.target.value)}
                    placeholder="Dirección del local..." />
                </div>

                <div className="step-actions">
                  <button 
                    type="button" 
                    className="btn btn-primary btn-next" 
                    onClick={handleContinue}
                    disabled={!isStep1Complete}
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* --- ACORDEÓN 2: RUBROS (BLOQUEADO HASTA PASO 1) --- */}
          <div className={`accordion-item ${activeSection === 'type' ? 'open' : ''} ${!isStep1Complete ? 'locked' : ''}`}>
            <div className="accordion-header" onClick={() => handleSectionToggle('type')}>
              <div className="header-title">
                <span className="step-number">2</span>
                <span>Giro del Negocio</span>
              </div>
              <div className="header-status">
                {!isStep1Complete ? <Lock size={18} className="icon-locked"/> : <ChevronDown size={20} className="icon-chevron" />}
              </div>
            </div>

            {activeSection === 'type' && (
              <div className="accordion-body">
                <p className="rubro-intro">
                  Selecciona a qué se dedica tu empresa. Esto activará funciones especiales (recetas, tallas, caducidad, etc.).
                </p>

                {maxRubrosAllowed === 1 && (
                  <div className="trial-badge" style={{marginBottom: '10px', fontSize: '0.9rem', color: 'var(--primary-color)', backgroundColor: '#fff3cd', padding: '8px', borderRadius: '6px'}}>
                    <Info size={16} aria-hidden="true" /> <strong>Atención:</strong> Tu plan actual permite seleccionar <strong>1 rubro</strong> principal.
                  </div>
                )}

                <div className="rubro-grid">
                  {BUSINESS_RUBROS.map(rubro => {
                    // Verificar visualmente si está bloqueado por licencia
                    const isLockedByLicense = !isAllAllowed && !allowedRubrosList.includes(rubro.id);
                    const isSelected = selectedTypes.includes(rubro.id);
                    const RubroIcon = rubro.icon;

                    return (
                      <div
                        key={rubro.id}
                        className={`rubro-card ${isSelected ? 'selected' : ''} ${isLockedByLicense ? 'disabled' : ''}`}
                        onClick={() => !isLockedByLicense && handleTypeClick(rubro.id)}
                        style={isLockedByLicense ? { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(1)' } : {}}
                        title={isLockedByLicense ? "No incluido en tu licencia" : ""}
                      >
                        <span className="rubro-icon">
                          <RubroIcon size={28} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span className="rubro-label">{rubro.label}</span>
                        {isLockedByLicense && <span style={{fontSize:'0.65rem', color:'var(--error-color)', marginTop:'2px'}}>Bloqueado</span>}
                      </div>
                    );
                  })}
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="step-actions end">
                  <button type="submit" className="btn btn-save btn-finish">
                    <Rocket size={18} aria-hidden="true" /> ¡Finalizar y Empezar!
                  </button>
                </div>
              </div>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
