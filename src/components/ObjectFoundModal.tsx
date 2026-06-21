import './ObjectFoundModal.css';

interface ObjectFoundModalProps {
    isOpen?: boolean;
    onClose?: () => void;
}

function ObjectFoundModal({
    isOpen = false,
    onClose
}: ObjectFoundModalProps)
{
    return (
        <div id="modal-backdrop" className={isOpen ? '' : 'hidden'}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-desc">
                <h2 id="modal-title">Objeto encontrado</h2>
                <p id="modal-desc">Has encontrado un objeto de la lista.</p>
                <button id="btn-close" type="button" onClick={onClose}>Continuar buscando</button>
            </div>
        </div>
    );
}

export default ObjectFoundModal;