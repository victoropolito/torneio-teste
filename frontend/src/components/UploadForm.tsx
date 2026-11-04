import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { api } from '../api';
import { formatCents } from '../format';
import type { TournamentDetail } from '../types';

/** Guardado como texto para o campo poder ficar vazio enquanto se digita. */
const DEFAULT_SPLIT = ['50', '30', '20'];
const DEFAULT_PRIZE_CENTS = 1_000_000;
/** R$ 999.999.999,99 */
const MAX_PRIZE_DIGITS = 11;

export function UploadForm({ onImported }: { onImported: (tournament: TournamentDetail) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [prizeCents, setPrizeCents] = useState(DEFAULT_PRIZE_CENTS);
  const [split, setSplit] = useState<string[]>(DEFAULT_SPLIT);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const splitTotal = split.reduce((sum, percent) => sum + (Number(percent) || 0), 0);
  const prizeDisplay = formatCents(prizeCents);

  const updateSplit = (index: number, value: string) =>
    setSplit((current) => current.map((percent, i) => (i === index ? value : percent)));

  /** Saiu do campo sem digitar nada: volta o zero. */
  const restoreZero = (index: number) => {
    if (split[index].trim() === '') updateSplit(index, '0');
  };

  /**
   * Máscara de moeda: os dígitos entram pela direita (como em maquininha).
   * Digitar "1", "5", "0", "0" → R$ 0,01 → R$ 0,15 → R$ 1,50 → R$ 15,00.
   */
  const handlePrizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const digits = value.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length > MAX_PRIZE_DIGITS) return;
    let cents = Number(digits || '0');
    // Apagou um caractere que não é dígito (ponto, vírgula, "R$"): apaga o último dígito.
    if (cents === prizeCents && value.length < prizeDisplay.length) cents = Math.floor(prizeCents / 10);
    setPrizeCents(cents);
  };

  const moveCaretToEnd = (input: HTMLInputElement) =>
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  const clearFile = () => {
    setFile(null);
    // Sem isso, escolher o mesmo arquivo de novo não dispara onChange.
    if (fileInput.current) fileInput.current.value = '';
  };

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError('Selecione a planilha (.csv).');
    if (prizeCents <= 0) return setError('Informe o valor do prêmio.');

    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('prizeTotal', (prizeCents / 100).toFixed(2));
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
      <div className="field field-file">
        <span className="field-label">Planilha (.csv)</span>
        <div className={`file-picker ${file ? 'has-file' : ''}`}>
          <label className="file-button">
            <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={chooseFile} />
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path
                d="M8 10V2m0 0L5 5m3-3 3 3M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {file ? 'Trocar arquivo' : 'Escolher arquivo'}
          </label>
          <span className={`file-name ${file ? '' : 'muted'}`} title={file?.name}>
            {file ? file.name : 'Nenhum arquivo escolhido'}
          </span>
          {file && (
            <button
              type="button"
              className="icon-button"
              onClick={clearFile}
              aria-label="Remover arquivo"
              title="Remover arquivo"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Nome do torneio</span>
        <input
          type="text"
          value={name}
          placeholder={file ? file.name.replace(/\.[^.]+$/, '') : 'ex.: Setembro 2026'}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Prêmio total</span>
        <input
          type="text"
          inputMode="numeric"
          className="money"
          value={prizeDisplay}
          onChange={handlePrizeChange}
          onFocus={(e) => moveCaretToEnd(e.currentTarget)}
          onClick={(e) => moveCaretToEnd(e.currentTarget)}
        />
      </label>

      <fieldset>
        <legend>Divisão por colocação (%)</legend>
        <div className="split">
          {split.map((percent, index) => (
            <label key={index} className="split-item">
              <span>{index + 1}º</span>
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
          <button type="button" className="secondary small-button" onClick={() => setSplit([...split, '0'])}>
            + colocação
          </button>
          {split.length > 1 && (
            <button type="button" className="secondary small-button" onClick={() => setSplit(split.slice(0, -1))}>
              − colocação
            </button>
          )}
        </div>
        <small className={splitTotal === 100 ? 'muted' : 'error'}>
          Soma: {splitTotal}%{splitTotal !== 100 && ' (precisa ser 100%)'}
        </small>
      </fieldset>

      {error && <p className="error form-error">{error}</p>}

      <button type="submit" disabled={sending}>
        {sending ? 'Importando…' : 'Importar planilha'}
      </button>
    </form>
  );
}
