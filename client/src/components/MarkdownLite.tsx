import { Fragment, type ReactNode } from 'react';

// Renderer minimalista para el texto que devuelve la IA en "Conclusiones"
// (## encabezados, líneas - de viñeta, **negrita**) — evita sumar una
// librería de Markdown completa para un uso tan acotado. Cualquier otra
// sintaxis (tablas, links, etc.) se muestra tal cual, como texto plano.
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (key: string) => {
    if (currentList.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 mb-3">
        {currentList.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    currentList = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushList(`ul-${i}`);
      blocks.push(
        <h3 key={i} className="font-semibold text-slate-800 mt-4 mb-1.5 first:mt-0">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      flushList(`ul-${i}`);
      blocks.push(
        <h2 key={i} className="text-base font-bold text-slate-900 mt-4 mb-1.5 first:mt-0">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
    } else if (trimmed === '') {
      flushList(`ul-${i}`);
    } else {
      flushList(`ul-${i}`);
      blocks.push(
        <p key={i} className="mb-2">
          {renderInline(trimmed)}
        </p>
      );
    }
  });
  flushList('ul-end');

  return <div className={className || 'text-sm text-slate-700 leading-relaxed'}>{blocks}</div>;
}
