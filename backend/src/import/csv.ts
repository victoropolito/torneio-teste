import { parse } from 'csv-parse/sync';
import { AppError } from '../errors.js';

/**
 * Decodifica o arquivo como UTF-8; se não for UTF-8 válido, assume Windows-1252
 * (padrão do Excel em português ao exportar "CSV (separado por vírgulas)").
 */
function decode(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** O Excel em pt-BR exporta com ";"; aceita "," por garantia. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const semicolons = firstLine.split(';').length;
  const commas = firstLine.split(',').length;
  return semicolons >= commas ? ';' : ',';
}

/** Converte o arquivo em uma matriz de células (primeira linha = cabeçalho). */
export function readCsv(buffer: Buffer): string[][] {
  const text = decode(buffer);
  if (!text.trim()) throw new AppError('O arquivo está vazio.');

  try {
    return parse(text, {
      delimiter: detectDelimiter(text),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];
  } catch (err) {
    throw new AppError(`Não foi possível ler o CSV: ${(err as Error).message}`);
  }
}
