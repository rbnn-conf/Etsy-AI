// How a pattern's hook size is printed: one rule for the documents, their QC
// and the Telegram review. The approved US value is shown as written; "US" is
// added only when the value does not already name the system, so
// {us: "US 8 steel"} reads "(US 8 steel)", never "(US US 8 steel)".
export const usHookLabel=us=>/^\s*US(?![a-z])/i.test(String(us))?String(us):`US ${us}`;
export const hookText=h=>`${h.mm} mm${h.us?` (${usHookLabel(h.us)})`:''}`;
export const hookOf=p=>p.requires_hook===false?'No hook needed':hookText(p.hook_size);
