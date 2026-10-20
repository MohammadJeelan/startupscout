import { useEffect, useMemo, useRef, useState } from 'react';

type Co = { name: string; seed_url: string; status: string; error: string; scraped_at: string; domain: string; final_url: string; title: string; description: string; og_site_name: string; careers_url: string; linkedin: string; twitter: string; github: string; youtube: string; instagram: string; public_emails: string; site_generator: string; sources: Record<string, string>; tags_derived: string[]; completeness: number };
type Report = { input_rows: number; after_dedupe: number; duplicates_removed: { name: string; domain_key: string }[]; failed: { name: string; seed_url: string; error: string }[]; field_fill_rate: Record<string, number>; generated_at: string };
type Route = { page: 'list' } | { page: 'co'; slug: string } | { page: 'insights' } | { page: 'shortlist' } | { page: 'collect' };
type Seed = { name: string; url: string };
type RawRec = { name: string; seed_url: string; status: string; error?: string; scraped_at?: string; fields?: Record<string, { value: string; source: string }> };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parse = (): Route => { const h = location.hash.slice(1); if (h.startsWith('/c/')) return { page: 'co', slug: h.slice(3) }; if (h === '/insights') return { page: 'insights' }; if (h === '/shortlist') return { page: 'shortlist' }; if (h === '/collect') return { page: 'collect' }; return { page: 'list' }; };
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const FIELD_LABEL: Record<string, string> = { title: 'Page title', description: 'Meta description', og_site_name: 'Site name', domain: 'Domain', final_url: 'Homepage', careers_url: 'Careers page', linkedin: 'LinkedIn', twitter: 'X / Twitter', github: 'GitHub', youtube: 'YouTube', instagram: 'Instagram', public_emails: 'Public emails', site_generator: 'Site built with' };
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const TAG_RULES: [string, RegExp][] = [
  ['AI / ML', /\bai\b|artificial intelligence|machine learning|\bllm|genai|generative|agent/i],
  ['Security', /secur|threat|compliance|soc ?2|iso 27001|fraud|privacy/i],
  ['Fintech', /payment|fintech|bank|lending|upi|credit|invoice|expense|kyc/i],
  ['Logistics', /logistic|shipping|shipment|supply chain|courier/i],
  ['HR Tech', /hiring|recruit|talent|interview|performance review|okr/i],
  ['Data / Infra', /data pipeline|etl|observability|monitor|cloud|devops|\bapi\b|database|lakehouse|testing/i],
  ['SaaS / B2B', /saas|b2b|enterprise|workflow|sales|marketing|crm|customer support|email/i],
  ['Healthcare', /health|medical|diagnos|patholog|brain|clinic/i],
  ['Consumer', /consumer|teen|creator|live streaming|social|shopping|e-?commerce/i],
  ['EdTech', /learn|education|course|students|tutor/i],
];
function deriveTags(title: string, description: string) {
  const t = `${title} ${description}`;
  return TAG_RULES.filter(([, re]) => re.test(t)).map(([k]) => k);
}
function flattenRaw(raw: RawRec[]): Co[] {
  return raw.map((r) => {
    const f = r.fields || {};
    const g = (k: string) => (f[k]?.value || '').trim();
    const title = g('title'), description = g('description');
    const filled = ['title','description','careers_url','linkedin','twitter','github','public_emails'].map(g);
    return {
      name: r.name, seed_url: r.seed_url, status: r.status, error: r.error || '', scraped_at: r.scraped_at || '',
      domain: g('domain'), final_url: g('final_url'), title, description, og_site_name: g('og_site_name'),
      careers_url: g('careers_url'), linkedin: g('linkedin'), twitter: g('twitter'), github: g('github'),
      youtube: g('youtube'), instagram: g('instagram'), public_emails: g('public_emails'), site_generator: g('site_generator'),
      sources: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.source])),
      tags_derived: deriveTags(title, description),
      completeness: filled.filter(Boolean).length / filled.length,
    };
  });
}
function downloadBlob(name: string, body: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function Mark() { return <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="11" fill="var(--ink)" /><path d="M12 4l3 8-3 8-3-8z" fill="var(--lime)" /><circle cx="12" cy="12" r="1.6" fill="var(--ink)" /></svg>; }

function Bars({ rows, max, fmt }: { rows: [string, number][]; max: number; fmt: (n: number) => string }) {
  return <ul className="bars">{rows.map(([k, v]) => <li key={k}><span>{k}</span><div><i style={{ width: `${(v / (max || 1)) * 100}%` }} /></div><b>{fmt(v)}</b></li>)}</ul>;
}

export default function App() {
  const [data, setData] = useState<Co[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [route, setRoute] = useState<Route>(parse);
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [onlyCareers, setOnlyCareers] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const [sort, setSort] = useState<'name' | 'completeness'>('name');
  const [stars, setStars] = useState<string[]>(() => load('ss.stars', []));
  const [notes, setNotes] = useState<Record<string, string>>(() => load('ss.notes', {}));
  const [seeds, setSeeds] = useState<Seed[]>(() => load('ss.seeds', []));
  const [seedName, setSeedName] = useState('');
  const [seedUrl, setSeedUrl] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [dataSource, setDataSource] = useState<'bundled' | 'imported'>('bundled');
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const fetchAll = () => {
    setErr(''); setData(null);
    Promise.all([fetch(`${import.meta.env.BASE_URL}startups.json`).then((r) => { if (!r.ok) throw new Error(`startups.json: HTTP ${r.status}`); return r.json(); }), fetch(`${import.meta.env.BASE_URL}dedupe_report.json`).then((r) => (r.ok ? r.json() : null))])
      .then(([d, rep]) => { setData(d); setReport(rep); }).catch((e) => setErr(String(e.message || e)));
  };
  useEffect(fetchAll, []);
  useEffect(() => { const h = () => { setRoute(parse()); window.scrollTo(0, 0); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => localStorage.setItem('ss.stars', JSON.stringify(stars)), [stars]);
  useEffect(() => localStorage.setItem('ss.notes', JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem('ss.seeds', JSON.stringify(seeds)), [seeds]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement).tagName;
      if (e.key === 'Escape') { if (t === 'INPUT' || t === 'TEXTAREA') (e.target as HTMLElement).blur(); else if (route.page === 'co') location.hash = '/'; return; }
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === '/') { e.preventDefault(); if (route.page !== 'list') location.hash = '/'; setTimeout(() => searchRef.current?.focus(), 30); }
      if (e.key === 'g') location.hash = '/insights';
      if (e.key === 's') location.hash = '/shortlist';
      if (e.key === 'c') location.hash = '/collect';
    };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, [route]);

  const allTags = useMemo(() => { const m = new Map<string, number>(); data?.forEach((c) => c.tags_derived.forEach((t) => m.set(t, (m.get(t) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [data]);
  const ok = useMemo(() => data?.filter((c) => c.status === 'ok') ?? [], [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    return data.filter((c) => (showFailed || c.status === 'ok') && (!onlyCareers || c.careers_url) && tags.every((t) => c.tags_derived.includes(t)) &&
      (!ql || `${c.name} ${c.domain} ${c.title} ${c.description} ${c.tags_derived.join(' ')}`.toLowerCase().includes(ql)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.completeness - a.completeness));
  }, [data, q, tags, onlyCareers, showFailed, sort]);
  const toggleStar = (n: string) => setStars((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const exportCSV = (rows: Co[], name: string) => {
    const cols = ['name', 'domain', 'final_url', 'title', 'description', 'careers_url', 'linkedin', 'twitter', 'github', 'public_emails', 'scraped_at'] as const;
    const body = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(String(r[c] ?? ''))).join(','))].join('\n');
    downloadBlob(name, body, 'text/csv');
  };
  const exportShortlist = (rows: Co[]) => {
    const cols = ['name', 'domain', 'final_url', 'careers_url', 'linkedin', 'notes', 'scraped_at'];
    const body = [cols.join(','), ...rows.map((r) => [
      r.name, r.domain, r.final_url, r.careers_url, r.linkedin, notes[r.name] || '', r.scraped_at,
    ].map((c) => csvCell(String(c))).join(','))].join('\n');
    downloadBlob('startupscout-shortlist.csv', body, 'text/csv');
  };
  const downloadSeedsCsv = () => {
    const body = ['name,url', ...seeds.map((s) => `${csvCell(s.name)},${csvCell(s.url)}`)].join('\n');
    downloadBlob('my-seeds.csv', body, 'text/csv');
  };
  const addSeed = () => {
    const name = seedName.trim(); let url = seedUrl.trim();
    if (!name || !url) { setImportMsg('Name and URL are required.'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (seeds.some((s) => s.url === url || s.name.toLowerCase() === name.toLowerCase())) {
      setImportMsg('That seed is already in the list.'); return;
    }
    setSeeds((prev) => [...prev, { name, url }]);
    setSeedName(''); setSeedUrl(''); setImportMsg(`Added ${name}. Download seeds CSV, then run the scraper locally.`);
  };
  async function onImportJson(file: File) {
    setImportMsg('');
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('JSON must be a non-empty array');
      const first = parsed[0] as Record<string, unknown>;
      let next: Co[];
      if (first && typeof first === 'object' && 'fields' in first) {
        next = flattenRaw(parsed as RawRec[]);
      } else if (first && 'name' in first && 'status' in first) {
        next = (parsed as Co[]).map((c) => ({
          ...c,
          sources: c.sources || {},
          tags_derived: c.tags_derived || deriveTags(c.title || '', c.description || ''),
          completeness: typeof c.completeness === 'number' ? c.completeness : 0,
        }));
      } else {
        throw new Error('Unrecognized JSON. Import startups.json (cleaned) or raw.json (from scrape.py).');
      }
      setData(next);
      setReport({
        input_rows: next.length, after_dedupe: next.length, duplicates_removed: [],
        failed: next.filter((c) => c.status !== 'ok').map((c) => ({ name: c.name, seed_url: c.seed_url, error: c.error })),
        field_fill_rate: {}, generated_at: new Date().toISOString(),
      });
      setDataSource('imported');
      setImportMsg(`Loaded ${next.length} companies from ${file.name}. Open Directory to browse.`);
    } catch (e) {
      setImportMsg((e as Error).message);
    }
  }

  const header = (
    <header className="top">
      <a className="brand" href="#/"><Mark /><span>Startup<em>Scout</em></span></a>
      <nav aria-label="Main">
        <a href="#/" className={route.page === 'list' || route.page === 'co' ? 'on' : ''}>Directory</a>
        <a href="#/collect" className={route.page === 'collect' ? 'on' : ''}>Collect</a>
        <a href="#/insights" className={route.page === 'insights' ? 'on' : ''}>Pipeline &amp; insights</a>
        <a href="#/shortlist" className={route.page === 'shortlist' ? 'on' : ''}>Shortlist{stars.length > 0 && <b>{stars.length}</b>}</a>
      </nav>
    </header>
  );
  const footer = <footer><span>Built by Mohammed Jeelan · <a href="https://github.com/MohammadJeelan" target="_blank" rel="noreferrer">github.com/MohammadJeelan</a></span><span>Data scraped from each company's own public homepage. Independent project, not affiliated with Tracxn or any listed company.</span></footer>;

  if (err) return <div className="shell">{header}<main className="state"><h1>Couldn't load the dataset</h1><p>{err}</p><button onClick={fetchAll}>Try again</button></main>{footer}</div>;
  if (!data) return <div className="shell">{header}<main className="state" aria-busy><div className="skel" /><div className="skel" /><div className="skel" /><p className="muted">Loading 55 company records…</p></main>{footer}</div>;

  const Card = ({ c }: { c: Co }) => (
    <li className={'card' + (c.status !== 'ok' ? ' failed' : '')}>
      <a href={`#/c/${slug(c.name)}`} className="cardlink">
        <div className="cn"><h3>{c.name}</h3><span className="dom">{c.domain || short(c.seed_url)}</span></div>
        <p>{c.status === 'ok' ? (c.description || c.title || <i className="muted">No description published on homepage</i>) : <i className="muted">Not collected: {c.error}</i>}</p>
        <div className="tags">{c.tags_derived.map((t) => <span key={t}>{t}</span>)}</div>
      </a>
      <div className="meta"><span className="fill" title="Share of key fields found"><i style={{ width: `${c.completeness * 100}%` }} /></span><span>{Math.round(c.completeness * 7)}/7 fields</span>
        {c.careers_url && <a href={c.careers_url} target="_blank" rel="noreferrer">careers ↗</a>}
        <button className={'star' + (stars.includes(c.name) ? ' on' : '')} aria-pressed={stars.includes(c.name)} aria-label={`Shortlist ${c.name}`} onClick={() => toggleStar(c.name)}>{stars.includes(c.name) ? '★' : '☆'}</button></div>
    </li>
  );

  let body;
  if (route.page === 'co') {
    const c = data.find((x) => slug(x.name) === route.slug);
    body = !c ? <main className="state"><h1>No company at this address</h1><a href="#/">← Back to directory</a></main> : (
      <main className="profile">
        <a href="#/" className="back">← Directory <kbd>Esc</kbd></a>
        <div className="phead"><div><h1>{c.name}</h1><a href={c.final_url || c.seed_url} target="_blank" rel="noreferrer" className="dom">{short(c.final_url || c.seed_url)} ↗</a></div>
          <button className={'star big' + (stars.includes(c.name) ? ' on' : '')} onClick={() => toggleStar(c.name)}>{stars.includes(c.name) ? '★ Shortlisted' : '☆ Add to shortlist'}</button></div>
        {c.description && <blockquote>{c.description}<cite>meta description, <a href={c.sources.description} target="_blank" rel="noreferrer">{short(c.sources.description)}</a></cite></blockquote>}
        <div className="tags">{c.tags_derived.map((t) => <a key={t} href="#/" onClick={() => setTags([t])}>{t}</a>)}{c.tags_derived.length > 0 && <span className="muted small">sector tags derived from page text by keyword rules</span>}</div>
        <div className="pgrid">
          <section><h2>Collected fields</h2>
            {c.status !== 'ok' ? <p className="muted">The scraper could not collect this page ({c.error}). Nothing is filled in by hand, so the record stays empty.</p> :
              <table className="fields"><thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead><tbody>
                {Object.keys(FIELD_LABEL).map((k) => { const v = (c as unknown as Record<string, string>)[k]; return <tr key={k} className={v ? '' : 'blank'}><td>{FIELD_LABEL[k]}</td><td>{v ? (/^https?:/.test(v) ? <a href={v} target="_blank" rel="noreferrer">{short(v)}</a> : v) : <span className="muted">not found</span>}</td><td>{c.sources[k] ? <a href={c.sources[k]} target="_blank" rel="noreferrer" title={c.sources[k]}>{short(c.sources[k])}</a> : '—'}</td></tr>; })}
              </tbody></table>}
            <p className="muted small">Scraped {new Date(c.scraped_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · seed {c.seed_url}</p></section>
          <section><h2>Your notes</h2><textarea value={notes[c.name] ?? ''} placeholder="e.g. who to ask for a referral, open roles you saw…" onChange={(e) => setNotes({ ...notes, [c.name]: e.target.value })} aria-label="Notes" /><p className="muted small">Saved in this browser automatically.</p></section>
        </div>
      </main>);
  } else if (route.page === 'insights') {
    const fr = Object.entries(report?.field_fill_rate ?? {}).sort((a, b) => b[1] - a[1]);
    const gens = new Map<string, number>(); ok.forEach((c) => { const g = c.site_generator.split(/[ ,]/)[0]; if (g) gens.set(g, (gens.get(g) || 0) + 1); });
    body = <main className="insights">
      <h1>Pipeline &amp; insights</h1>
      <div className="funnel"><div><b>{report?.input_rows ?? '—'}</b>seed URLs</div><div><b>{report?.after_dedupe ?? '—'}</b>after dedupe</div><div><b>{ok.length}</b>pages collected</div><div><b>{data.length - ok.length}</b>not collected</div></div>
      <div className="igrid">
        <section><h2>Companies per sector tag</h2><Bars rows={allTags} max={allTags[0]?.[1] ?? 1} fmt={(n) => String(n)} /></section>
        <section><h2>Field fill rate</h2><Bars rows={fr.map(([k, v]) => [FIELD_LABEL[k] ?? k, v])} max={1} fmt={(n) => `${Math.round(n * 100)}%`} /></section>
        <section><h2>Duplicates removed</h2>{report?.duplicates_removed.length ? <ul className="plain">{report.duplicates_removed.map((d) => <li key={d.name}><b>{d.name}</b> → same as <code>{d.domain_key}</code></li>)}</ul> : <p className="muted">None.</p>}<p className="muted small">Dedupe keys: final domain after redirects, then normalised name.</p></section>
        <section><h2>Not collected</h2><ul className="plain">{report?.failed.map((f) => <li key={f.name}><b>{f.name}</b> <span className="muted">{f.error}</span></li>)}</ul><p className="muted small">robots.txt disallow and 403s are respected, never retried around.</p></section>
        {gens.size > 0 && <section><h2>Site generator (where declared)</h2><Bars rows={[...gens.entries()].sort((a, b) => b[1] - a[1])} max={Math.max(...gens.values())} fmt={String} /></section>}
      </div>
      <p className="muted small">Dataset generated {report && new Date(report.generated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.</p>
    </main>;
  } else if (route.page === 'collect') {
    body = <main className="collect">
      <h1>Collect your own data</h1>
      <p className="lead">Browsers cannot scrape other companies&apos; sites (CORS + no robots.txt). Add seed URLs here, download a CSV, run the Python scraper on your machine, then import the JSON back into this directory.</p>
      <div className="cgrid">
        <section>
          <h2>1. Your seed URLs</h2>
          <p className="muted">Saved in this browser. Columns match <code>scrape.py</code>: <code>name,url</code>.</p>
          <div className="seed-form">
            <input placeholder="Company name" value={seedName} onChange={(e) => setSeedName(e.target.value)} aria-label="Seed company name" />
            <input placeholder="https://example.com" value={seedUrl} onChange={(e) => setSeedUrl(e.target.value)} aria-label="Seed URL" />
            <button type="button" onClick={addSeed}>Add seed</button>
          </div>
          {seeds.length === 0 ? <p className="muted">No custom seeds yet.</p> : (
            <ul className="seed-list">{seeds.map((s) => (
              <li key={s.url}><b>{s.name}</b> <span className="muted">{s.url}</span>
                <button className="ghost" type="button" onClick={() => setSeeds((prev) => prev.filter((x) => x.url !== s.url))}>Remove</button>
              </li>
            ))}</ul>
          )}
          <div className="row">
            <button type="button" disabled={!seeds.length} onClick={downloadSeedsCsv}>Download my-seeds.csv</button>
            <button type="button" className="ghost" disabled={!seeds.length} onClick={() => setSeeds([])}>Clear seeds</button>
          </div>
        </section>
        <section>
          <h2>2. Run the scraper locally</h2>
          <ol className="steps">
            <li>Clone / open the <code>scraper/</code> folder from this project.</li>
            <li><code>pip install -r requirements.txt</code></li>
            <li><code>python scrape.py my-seeds.csv -o raw.json</code></li>
            <li><code>python clean.py raw.json --out-dir ./out</code></li>
          </ol>
          <p className="muted small">The scraper respects robots.txt, waits 1.5s between requests, and never invents fields. See <code>scraper/README.md</code>.</p>
          <h2>3. Import the result</h2>
          <p className="muted">Accepts cleaned <code>startups.json</code> or scraper <code>raw.json</code>. Replaces the directory in this browser session (bundled file stays on disk).</p>
          <div className="row">
            <button type="button" onClick={() => importRef.current?.click()}>Import JSON…</button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportJson(f); e.target.value = ''; }} />
            {dataSource === 'imported' && <button type="button" className="ghost" onClick={() => { setDataSource('bundled'); fetchAll(); setImportMsg('Reloaded bundled dataset.'); }}>Reload bundled dataset</button>}
          </div>
          {importMsg && <p className="import-msg" role="status">{importMsg}</p>}
          <p className="muted small">Currently showing: <b>{dataSource === 'imported' ? 'imported JSON' : 'bundled startups.json'}</b> · {data.length} companies.</p>
        </section>
      </div>
    </main>;
  } else if (route.page === 'shortlist') {
    const rows = data.filter((c) => stars.includes(c.name));
    body = <main><div className="lhead"><h1>Shortlist</h1>{rows.length > 0 && <><button onClick={() => exportShortlist(rows)}>Export shortlist CSV</button><button className="ghost" onClick={() => setStars([])}>Clear all</button></>}</div>
      {rows.length === 0 ? <div className="state"><p>No companies shortlisted yet. Star ☆ any card in the <a href="#/">directory</a>.</p></div> : <ul className="cards">{rows.map((c) => <Card key={c.name} c={c} />)}</ul>}</main>;
  } else {
    body = <main>
      <section className="hero"><h1>{ok.length} startups from the Bengaluru tech scene, <span>straight from their own homepages.</span></h1>
        <p>Each field below was scraped by a polite Python crawler (robots.txt checked, 1.5 s between requests) and keeps a link to the page it came from. Blank means the site didn't publish it. Want your own list? <a href="#/collect">Collect</a>.</p></section>
      <div className="controls">
        <input ref={searchRef} type="search" placeholder="Search name, domain, description…   ( / )" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
        <select value={sort} onChange={(e) => setSort(e.target.value as 'name')} aria-label="Sort"><option value="name">A → Z</option><option value="completeness">Most complete first</option></select>
        <label><input type="checkbox" checked={onlyCareers} onChange={(e) => setOnlyCareers(e.target.checked)} /> Has careers page</label>
        <label><input type="checkbox" checked={showFailed} onChange={(e) => setShowFailed(e.target.checked)} /> Show not-collected</label>
        <button onClick={() => exportCSV(filtered, 'startupscout.csv')} disabled={!filtered.length}>Export {filtered.length} as CSV</button>
      </div>
      <div className="chips" role="group" aria-label="Sector filter">{allTags.map(([t, n]) => <button key={t} aria-pressed={tags.includes(t)} className={tags.includes(t) ? 'on' : ''} onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>{t} <small>{n}</small></button>)}
        {tags.length > 0 && <button className="ghost" onClick={() => setTags([])}>clear</button>}</div>
      {filtered.length === 0 ? <div className="state"><p>No company matches “{q}”{tags.length ? ` with ${tags.join(' + ')}` : ''}.</p><button onClick={() => { setQ(''); setTags([]); setOnlyCareers(false); }}>Reset filters</button></div>
        : <ul className="cards">{filtered.map((c) => <Card key={c.name} c={c} />)}</ul>}
    </main>;
  }
  return <div className="shell">{header}{body}{footer}</div>;
}
