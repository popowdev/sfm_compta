import { type ReactNode } from 'react';

type Rule = { re: RegExp; render: (m: RegExpExecArray, key: string) => ReactNode };

function inlineRules(): Rule[] {
  return [
    { re: /```([\s\S]+?)```/, render: (m, k) => <code key={k} className="block whitespace-pre-wrap rounded-md bg-black/30 px-2 py-1.5 font-mono text-[0.8rem]">{(m[1] ?? '').replace(/^\n/, '')}</code> },
    { re: /`([^`]+?)`/, render: (m, k) => <code key={k} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.85em]">{m[1] ?? ''}</code> },
    { re: /\*\*([\s\S]+?)\*\*/, render: (m, k) => <strong key={k}>{inline(m[1] ?? '', k)}</strong> },
    { re: /__([\s\S]+?)__/, render: (m, k) => <u key={k}>{inline(m[1] ?? '', k)}</u> },
    { re: /~~([\s\S]+?)~~/, render: (m, k) => <s key={k}>{inline(m[1] ?? '', k)}</s> },
    { re: /\|\|([\s\S]+?)\|\|/, render: (m, k) => <span key={k} className="rounded bg-muted-foreground/30 px-1 text-transparent transition-colors hover:text-foreground">{inline(m[1] ?? '', k)}</span> },
    { re: /\*([\s\S]+?)\*/, render: (m, k) => <em key={k}>{inline(m[1] ?? '', k)}</em> },
    { re: /_([\s\S]+?)_/, render: (m, k) => <em key={k}>{inline(m[1] ?? '', k)}</em> },
    { re: /\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/, render: (m, k) => <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">{m[1] ?? ''}</a> },
    { re: /(https?:\/\/[^\s<]+)/, render: (m, k) => <a key={k} href={m[1]} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline underline-offset-2">{m[1] ?? ''}</a> },
  ];
}

function inline(text: string, keyBase: string): ReactNode[] {
  const rules = inlineRules();
  let best: { idx: number; rule: Rule; m: RegExpExecArray } | null = null;
  for (const rule of rules) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, rule, m };
  }
  if (!best) return [text];
  const before = text.slice(0, best.idx);
  const after = text.slice(best.idx + best.m[0].length);
  const key = `${keyBase}-${best.idx}`;
  return [before, best.rule.render(best.m, key), ...inline(after, `${key}b`)];
}

export function renderMarkdown(src: string): ReactNode {
  const lines = (src ?? '').replace(/\r\n/g, '\n').split('\n');
  const at = (n: number): string => lines[n] ?? '';
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = at(i);

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(at(i))) { buf.push(at(i)); i++; }
      i++;
      blocks.push(<pre key={`b${key++}`} className="my-1 overflow-x-auto rounded-md bg-black/30 p-2 font-mono text-[0.8rem]"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = (h[1] ?? '').length;
      const cls = lvl === 1 ? 'text-base font-bold' : lvl === 2 ? 'text-sm font-bold' : 'text-sm font-semibold';
      blocks.push(<div key={`b${key++}`} className={`mt-1 ${cls}`}>{inline(h[2] ?? '', `h${key}`)}</div>);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(at(i))) { buf.push(at(i).replace(/^>\s?/, '')); i++; }
      blocks.push(<blockquote key={`b${key++}`} className="my-1 border-l-2 border-muted-foreground/40 pl-3 text-muted-foreground">{inline(buf.join('\n'), `q${key}`)}</blockquote>);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(at(i))) { items.push(at(i).replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(<ul key={`b${key++}`} className="my-1 list-disc space-y-0.5 pl-5">{items.map((it, j) => <li key={j}>{inline(it, `li${key}-${j}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(at(i))) { items.push(at(i).replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push(<ol key={`b${key++}`} className="my-1 list-decimal space-y-0.5 pl-5">{items.map((it, j) => <li key={j}>{inline(it, `oli${key}-${j}`)}</li>)}</ol>);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const para: string[] = [];
    while (i < lines.length && at(i).trim() !== '' && !/^```|^#{1,3}\s|^>\s?|^\s*[-*]\s|^\s*\d+\.\s/.test(at(i))) { para.push(at(i)); i++; }
    blocks.push(<p key={`b${key++}`} className="whitespace-pre-wrap break-words">{inline(para.join('\n'), `p${key}`)}</p>);
  }

  return <div className="space-y-1 text-sm leading-relaxed">{blocks}</div>;
}
