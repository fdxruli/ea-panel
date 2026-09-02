import React from 'react';
import styles from './ErrorBoudary.module.css';

const DEFAULT_SCOPE = 'application';
const ERROR_STACK_LIMIT = 4000;

const toText = (value) => {
  if (value === null || value === undefined) return '';

  try {
    return String(value);
  } catch (_error) {
    return 'No disponible';
  }
};

const truncate = (value, maxLength = ERROR_STACK_LIMIT) => {
  const text = toText(value);

  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength) + '\n...[contenido truncado]';
};

const createErrorId = () => {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  return 'EA-' + randomId.toUpperCase();
};

const getErrorMessage = (error) => {
  if (!error) return 'No se recibió información adicional.';

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return toText(error) || 'No se recibió información adicional.';
};

const getCurrentPath = () => {
  if (typeof window === 'undefined' || !window.location) {
    return 'No disponible';
  }

  const pathname = window.location.pathname || '/';
  return pathname + (window.location.search ? ' [parámetros omitidos]' : '');
};

const getAppMode = () => {
  try {
    return import.meta.env?.MODE || 'desconocido';
  } catch (_error) {
    return 'desconocido';
  }
};

const getDiagnosis = (error) => {
  const signature = (
    toText(error?.name) +
    ' ' +
    getErrorMessage(error)
  ).toLowerCase();

  if (
    /chunk|dynamically imported|importing a module script|module script failed|loading css chunk/.test(
      signature
    )
  ) {
    return {
      category: 'Carga de la aplicación',
      summary:
        'El navegador no pudo cargar un módulo de esta versión. Puede existir una actualización pendiente o una caché desincronizada.',
      action:
        'Recargar la aplicación y, si continúa, revisar la última publicación y la caché del navegador.',
    };
  }

  if (
    /network|failed to fetch|fetch failed|networkerror|timeout|load failed|connection/.test(
      signature
    )
  ) {
    return {
      category: 'Red o servicio externo',
      summary:
        'La sección pudo fallar al comunicarse con un servicio externo o por una interrupción temporal de internet.',
      action:
        'Comprobar la conexión, reintentar y revisar el estado del servicio si el error persiste.',
    };
  }

  if (
    /unauthori[sz]ed|forbidden|permission|rls|jwt|session|auth/.test(signature)
  ) {
    return {
      category: 'Sesión o permisos',
      summary:
        'El error contiene señales de autenticación, sesión vencida o permisos insuficientes para esta sección.',
      action:
        'Reintentar la carga y validar que el administrador tenga la sesión y permisos correctos.',
    };
  }

  return {
    category: 'Error inesperado de interfaz',
    summary:
      'La interfaz encontró una excepción no clasificada mientras intentaba renderizar esta sección.',
    action:
      'Reintentar, copiar este reporte y revisar el stack técnico junto con los pasos que provocaron el error.',
  };
};

const getConnectionStatus = () => {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.onLine !== 'boolean'
  ) {
    return 'No disponible';
  }

  return navigator.onLine ? 'En línea' : 'Sin conexión';
};

const getBrowserReport = () => {
  if (typeof navigator === 'undefined') {
    return [
      'Navegador: No disponible',
      'Idioma: No disponible',
      'Plataforma: No disponible',
    ].join('\n');
  }

  return [
    'Navegador: ' + truncate(navigator.userAgent, 600),
    'Idioma: ' + (navigator.language || 'No disponible'),
    'Plataforma: ' + (navigator.platform || 'No disponible'),
  ].join('\n');
};

const getViewportReport = () => {
  if (typeof window === 'undefined') return 'No disponible';

  const ratio = window.devicePixelRatio || 1;
  return (
    window.innerWidth +
    'x' +
    window.innerHeight +
    ' CSS px; DPR ' +
    ratio
  );
};

const copyTextToClipboard = async (value) => {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (clipboardError) {
      console.warn(
        'El portapapeles moderno no estuvo disponible; se intentará el respaldo.',
        clipboardError
      );
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('El documento no está disponible para copiar el reporte.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;

  try {
    copied =
      typeof document.execCommand === 'function' &&
      document.execCommand('copy');
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }

  if (!copied) {
    throw new Error('El navegador no permitió copiar el reporte.');
  }
};

const AlertIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M12 9v3m0 3.75h.01M10.29 3.86 2.82 17.25A1.75 1.75 0 0 0 4.34 19.9h15.32a1.75 1.75 0 0 0 1.52-2.65L13.71 3.86a1.96 1.96 0 0 0-3.42 0Z"
    />
  </svg>
);

const CopyIcon = () => (
  <svg
    className={styles.buttonIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg
    className={styles.buttonIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10m0 0V5m0 5h5M4 13a8.1 8.1 0 0 0 14.9 4L21 14m0 0v5m0-5h-5"
    />
  </svg>
);

const HomeIcon = () => (
  <svg
    className={styles.buttonIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M9 21v-6h6v6"
    />
  </svg>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      occurredAt: null,
      copyStatus: 'idle',
    };

    this.titleRef = null;
    this.copyFeedbackTimer = null;
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: createErrorId(),
      occurredAt: new Date().toISOString(),
      copyStatus: 'idle',
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó un error:', {
      error,
      errorInfo,
      scope: this.props.scope || DEFAULT_SCOPE,
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  componentDidUpdate(previousProps, previousState) {
    if (
      !previousState.hasError &&
      this.state.hasError &&
      this.titleRef &&
      typeof this.titleRef.focus === 'function'
    ) {
      this.titleRef.focus();
    }
  }

  componentWillUnmount() {
    if (
      this.copyFeedbackTimer !== null &&
      typeof window !== 'undefined'
    ) {
      window.clearTimeout(this.copyFeedbackTimer);
    }
  }

  setTitleRef = (node) => {
    this.titleRef = node;
  };

  handleReportFocus = (event) => {
    event.currentTarget.select();
  };

  handleCopyReport = async () => {
    const report = this.getErrorReport();

    try {
      await copyTextToClipboard(report);
      this.setState({ copyStatus: 'copied' });
    } catch (copyError) {
      console.warn('No fue posible copiar el reporte:', copyError);
      this.setState({ copyStatus: 'failed' });
    }

    if (typeof window !== 'undefined') {
      if (this.copyFeedbackTimer !== null) {
        window.clearTimeout(this.copyFeedbackTimer);
      }

      this.copyFeedbackTimer = window.setTimeout(() => {
        if (this.state.hasError) {
          this.setState({ copyStatus: 'idle' });
        }
      }, 2800);
    }
  };

  handleRetry = () => {
    this.setState(
      {
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        occurredAt: null,
        copyStatus: 'idle',
      },
      () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    );
  };

  handleGoToDashboard = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/admin');
    }
  };

  getErrorReport = () => {
    const { error, errorInfo, errorId, occurredAt } = this.state;
    const diagnosis = getDiagnosis(error);
    const errorName = toText(error?.name) || 'Error desconocido';
    const errorMessage = getErrorMessage(error);
    const stack = truncate(error?.stack) || 'No disponible';
    const componentStack = truncate(
      errorInfo?.componentStack?.trim() || 'No disponible'
    );

    return [
      'REPORTE DE ERROR - PANEL ADMINISTRATIVO',
      '=========================================',
      'Identificador: ' + (errorId || 'No disponible'),
      'Fecha/hora UTC: ' + (occurredAt || 'No disponible'),
      'Modo de ejecución: ' + getAppMode(),
      'Ruta actual: ' + getCurrentPath(),
      'Conectividad: ' + getConnectionStatus(),
      'Viewport: ' + getViewportReport(),
      getBrowserReport(),
      '',
      'DIAGNÓSTICO INICIAL',
      'Categoría: ' + diagnosis.category,
      'Resumen: ' + diagnosis.summary,
      'Acción sugerida: ' + diagnosis.action,
      '',
      'ERROR CAPTURADO',
      'Nombre: ' + errorName,
      'Mensaje: ' + errorMessage,
      '',
      'STACK DE JAVASCRIPT',
      stack,
      '',
      'STACK DE COMPONENTES REACT',
      componentStack,
      '',
      'Nota: este reporte se generó localmente en el navegador y no se envió automáticamente.',
    ].join('\n');
  };

  renderPublicFallback() {
    return (
      <main className={styles.container + ' ' + styles.publicContainer} role="alert">
        <section className={styles.card + ' ' + styles.publicCard}>
          <div className={styles.iconWrap}>
            <AlertIcon />
          </div>
          <span className={styles.eyebrow}>Entre Alas</span>
          <h1
            className={styles.title}
            tabIndex={-1}
            ref={this.setTitleRef}
          >
            ¡Ups! Algo salió mal
          </h1>
          <p className={styles.message}>
            No pudimos cargar esta sección correctamente. Intenta nuevamente
            para continuar.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className={styles.actionButton + ' ' + styles.retryButton}
          >
            <RefreshIcon />
            <span>Intentar nuevamente</span>
          </button>
        </section>
      </main>
    );
  }

  renderAdminFallback() {
    const { copyStatus } = this.state;
    const diagnosis = getDiagnosis(this.state.error);
    const report = this.getErrorReport();
    const currentPath = getCurrentPath().split(' ')[0].replace(/\/+$/, '');
    const showDashboardButton =
      currentPath !== '/admin' && currentPath !== '';

    const copyLabel =
      copyStatus === 'copied'
        ? 'Reporte copiado'
        : copyStatus === 'failed'
          ? 'Copiar nuevamente'
          : 'Copiar reporte';

    return (
      <main className={styles.container} role="alert">
        <section className={styles.card}>
          <div className={styles.iconWrap}>
            <AlertIcon />
          </div>

          <span className={styles.eyebrow}>Panel administrativo</span>
          <h1
            className={styles.title}
            tabIndex={-1}
            ref={this.setTitleRef}
          >
            No pudimos cargar esta sección
          </h1>
          <p className={styles.message}>
            Ocurrió un error inesperado mientras se cargaba el panel. Puedes
            reintentar, copiar el diagnóstico para soporte o volver al
            dashboard si el problema pertenece únicamente a esta sección.
          </p>

          <div className={styles.diagnosis} role="status">
            <span className={styles.diagnosisLabel}>Diagnóstico inicial</span>
            <strong>{diagnosis.category}</strong>
            <p>{diagnosis.summary}</p>
          </div>

          <section
            className={styles.reportSection}
            aria-labelledby="admin-error-report-title"
          >
            <div className={styles.reportHeader}>
              <div>
                <span className={styles.reportLabel}>Información técnica</span>
                <h2 id="admin-error-report-title">Reporte detallado</h2>
              </div>
              <button
                type="button"
                onClick={this.handleCopyReport}
                className={styles.copyButton}
                aria-label="Copiar reporte detallado del error"
              >
                <CopyIcon />
                <span>{copyLabel}</span>
              </button>
            </div>

            <textarea
              className={styles.report}
              value={report}
              readOnly
              rows={14}
              spellCheck={false}
              aria-label="Reporte detallado del error"
              onFocus={this.handleReportFocus}
            />

            <p className={styles.copyStatus} role="status" aria-live="polite">
              {copyStatus === 'copied'
                ? 'El reporte quedó copiado en el portapapeles.'
                : copyStatus === 'failed'
                  ? 'No se pudo copiar automáticamente. Selecciona el texto del reporte y cópialo manualmente.'
                  : 'Comparte este reporte con soporte para facilitar el diagnóstico.'}
            </p>
          </section>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={this.handleRetry}
              className={styles.actionButton + ' ' + styles.retryButton}
            >
              <RefreshIcon />
              <span>Intentar nuevamente</span>
            </button>

            {showDashboardButton && (
              <button
                type="button"
                onClick={this.handleGoToDashboard}
                className={styles.actionButton + ' ' + styles.dashboardButton}
              >
                <HomeIcon />
                <span>Ir al dashboard</span>
              </button>
            )}
          </div>

          <p className={styles.hint}>
            ID de referencia: <strong>{this.state.errorId || 'No disponible'}</strong>
          </p>
        </section>
      </main>
    );
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return this.props.scope === 'admin'
      ? this.renderAdminFallback()
      : this.renderPublicFallback();
  }
}

export default ErrorBoundary;
