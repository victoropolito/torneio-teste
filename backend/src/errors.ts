/** Erro esperado, com mensagem segura para mostrar ao usuário. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
