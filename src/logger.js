const ts = () => new Date().toLocaleTimeString('es-CR', { hour12: false });

export const logger = {
  info:    (msg) => console.log(`ℹ️  [${ts()}] ${msg}`),
  success: (msg) => console.log(`✅ [${ts()}] ${msg}`),
  warn:    (msg) => console.log(`⚠️  [${ts()}] ${msg}`),
  error:   (msg) => console.log(`❌ [${ts()}] ${msg}`),
};
