import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { TournamentDetail } from '../types';

/** Guardado como texto para o campo poder ficar vazio enquanto se digita. */
const DEFAULT_SPLIT = ['50', '30', '20'];

export function UploadForm({ onImported }: { onImported: (tournament: TournamentDetail) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [prizeTotal, setPrizeTotal] = useState('10000');
  const [split, setSplit] = useState<string[]>(DEFAULT_SPLIT);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const splitTotal = split.reduce((sum, percent) => sum + (Number(percent) || 0), 0);

  const updateSplit = (index: number, value: string) =>
    setSplit((current) => current.map((percent, i) => (i === index ? value : percent)));

  /** Saiu do campo sem digitar nada: volta o zero. */
  const restoreZero = (index: number) => {
    if (split[index].trim() === '') updateSplit(index, '0');
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError('Selecione a planilha (.csv).');

    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('prizeTotal', prizeTotal);
    form.append('prizeSplit', split.map((percent) => Number(percent) || 0).join(','));

    setSending(true);
    setError(null);
    try {
      onImported(await api.importTournament(form));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="upload-form">
      <div className="field">
        <span>Planilha (.csv)</span>
        <label className="file-picker">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <span className="file-button">Escolher arquivo</span>
          <span className={`file-name ${file ? '' : 'muted'}`} title={file?.name}>
            {file ? file.name : 'Nenhum arquivo escolhido'}
          </span>
        </label>
      </div>

      <label>
        Nome do torneio
        <input
          type="text"
          value={name}
          placeholder={file ? file.name.replace(/\.[^.]+$/, '') : 'ex.: Setembro 2026'}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label>
        Prêmio total (R$)
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={prizeTotal}
          onChange={(e) => setPrizeTotal(e.target.value)}
        />
      </label>

      <fieldset>
        <legend>Divisão por colocação (%)</legend>
        <div className="split">
          {split.map((percent, index) => (
            <label key={index} className="split-item">
              {index + 1}º
              <input
                type="number"
                min="0"
                step="1"
                value={percent}
                onChange={(e) => updateSplit(index, e.target.value)}
                onBlur={() => restoreZero(index)}
              />
            </label>
          ))}
          <button type="button" className="link" onClick={() => setSplit([...split, '0'])}>
            + colocação
          </button>
          {split.length > 1 && (
            <button type="button" className="link" onClick={() => setSplit(split.slice(0, -1))}>
              − colocação
            </button>
          )}
        </div>
        <small className={splitTotal === 100 ? 'muted' : 'error'}>Soma: {splitTotal}%</small>
      </fieldset>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={sending}>
        {sending ? 'Importando…' : 'Importar'}
      </button>
    </form>
  );
}
