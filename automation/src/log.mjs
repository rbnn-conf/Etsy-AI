// Logger that redacts every configured secret (and anything shaped like a
// bot token or an OpenAI key) before a line is written.
const PATTERNS=[/\bsk-[A-Za-z0-9_-]{10,}/g,/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,/bot\d{6,12}:[A-Za-z0-9_-]+/g];
export function redactor(secrets=[]){
  const known=secrets.filter(s=>typeof s==='string'&&s.length>=8);
  return text=>{
    let out=String(text);
    for(const s of known)out=out.split(s).join('[REDACTED]');
    for(const re of PATTERNS)out=out.replace(re,'[REDACTED]');
    return out;
  };
}
export function createLogger({secrets=[],sink=console.error}={}){
  const redact=redactor(secrets);
  return line=>sink(`[${new Date().toISOString()}] ${redact(line)}`);
}
/** Short, safe description of an error for logs and Telegram. */
export function describeError(err){
  if(!err)return 'unknown error';
  const name=err.name&&err.name!=='Error'?`${err.name}: `:'';
  return `${name}${String(err.message??err).slice(0,400)}`;
}
