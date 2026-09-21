import type { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 overflow-y-auto">
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl my-8`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600 mb-4">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn-danger" onClick={onConfirm}>
          Eliminar
        </button>
      </div>
    </Modal>
  );
}
