<<<<<<< HEAD
import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import styles from './QRCodeModal.module.css';
import { useAlert } from '../context/AlertContext';

const QRCodeModal = ({ url, onClose }) => {
    const { showAlert } = useAlert();
    const qrRef = useRef(null);

    const handleShare = async () => {
        if (qrRef.current) {
            const canvas = qrRef.current.querySelector('canvas');
            canvas.toBlob(async (blob) => {
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: '¡Te invito a Entre Alas!',
                            text: 'Usa mi enlace de referido para registrarte.',
                            files: [
                                new File([blob], 'codigo-qr.png', {
                                    type: blob.type,
                                }),
                            ],
                        });
                    } catch (error) {
                        console.error('Error al compartir:', error);
                        showAlert('No se pudo compartir el código QR.');
                    }
                } else {
                    showAlert('Tu navegador no soporta la función de compartir.');
                }
            });
        }
    };


    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>Comparte tu Código QR</h2>
                <p>Tus amigos pueden escanear este código para usar tu enlace de referido.</p>
                <div className={styles.qrContainer} ref={qrRef}>
                    <QRCodeCanvas
                        value={url}
                        size={256}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"L"}
                        includeMargin={true}
                    />
                </div>
                <button onClick={handleShare} className={styles.shareButton}>
                    Compartir QR
                </button>
            </div>
        </div>
    );
};

=======
import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import styles from './QRCodeModal.module.css';
import { useAlert } from '../context/AlertContext';

const QRCodeModal = ({ url, onClose }) => {
    const { showAlert } = useAlert();
    const qrRef = useRef(null);

    const handleShare = async () => {
        if (qrRef.current) {
            const canvas = qrRef.current.querySelector('canvas');
            canvas.toBlob(async (blob) => {
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: '¡Te invito a Entre Alas!',
                            text: 'Usa mi enlace de referido para registrarte.',
                            files: [
                                new File([blob], 'codigo-qr.png', {
                                    type: blob.type,
                                }),
                            ],
                        });
                    } catch (error) {
                        console.error('Error al compartir:', error);
                        showAlert('No se pudo compartir el código QR.');
                    }
                } else {
                    showAlert('Tu navegador no soporta la función de compartir.');
                }
            });
        }
    };


    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>Comparte tu Código QR</h2>
                <p>Tus amigos pueden escanear este código para usar tu enlace de referido.</p>
                <div className={styles.qrContainer} ref={qrRef}>
                    <QRCodeCanvas
                        value={url}
                        size={256}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"L"}
                        includeMargin={true}
                    />
                </div>
                <button onClick={handleShare} className={styles.shareButton}>
                    Compartir QR
                </button>
            </div>
        </div>
    );
};

>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
export default QRCodeModal;