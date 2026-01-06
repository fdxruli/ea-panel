import React from 'react';
import styles from './ErrorBoudary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  // Este método se llama automáticamente cuando ocurre un error
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  // Este método sirve para registrar el error (puedes conectarlo a un servicio de logs)
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary capturó un error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    // Recargar la página es la solución más segura para errores de carga de chunks (lazy loading)
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          {/* Icono SVG de alerta simple */}
          <svg 
            className={styles.icon} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
          
          <h2 className={styles.title}>¡Ups! Algo salió mal</h2>
          <p className={styles.message}>
            No pudimos cargar esta sección correctamente. Puede deberse a una interrupción momentánea de internet o una actualización de la aplicación.
          </p>
          
          <button onClick={this.handleRetry} className={styles.retryButton}>
            Intentar nuevamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;