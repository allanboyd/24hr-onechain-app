export const toast = $state({ msg: '' });
let t: ReturnType<typeof setTimeout>;
export function say(msg: string) { toast.msg = msg; clearTimeout(t); t = setTimeout(() => (toast.msg = ''), 3200); }
