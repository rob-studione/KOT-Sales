import "server-only";

export type LostQaAgentMessageLike = {
  sender_name: string | null;
  sender_email: string | null;
  sender_role: string;
  body_clean: string | null;
  body_plain: string | null;
};

export function isGenericAgentName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (n === "vertimų karaliai") return true;
  if (n === "vk") return true;
  if (n === "kings of translation") return true;
  if (n.includes("vertimų karaliai")) return true;
  if (n.includes("kings of translation")) return true;
  if (/@/.test(n)) return true;
  if (/(info|sales|admin|support|hello|team|mailbox)/.test(n)) return true;
  return false;
}

export function extractSignaturePersonName(m: LostQaAgentMessageLike): string | null {
  const body = (m.body_clean ?? m.body_plain ?? "").trim();
  if (!body) return null;

  const lines = body
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const tail = lines.slice(-12);
  const bannedFragments = [
    "vertimų karaliai",
    "kings of translation",
    "uab",
    "www.",
    "http",
    "@",
    "+370",
    "tel.",
    "mob.",
    "pareigos",
    "manager",
    "sales",
    "project",
    "account",
    "director",
    "manageris",
    "vadybinink",
    "adresas",
    "vilnius",
    "kaunas",
  ];

  const looksLikePersonName = (line: string): boolean => {
    const l = line.trim();
    if (!l) return false;
    const lowered = l.toLowerCase();
    if (bannedFragments.some((x) => lowered.includes(x))) return false;
    if (/[0-9]/.test(l)) return false;
    if (/[/:|]/.test(l)) return false;
    const words = l.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 3) return false;
    return words.every((w) => /^[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž-]+$/u.test(w));
  };

  for (let i = tail.length - 1; i >= 0; i -= 1) {
    if (looksLikePersonName(tail[i])) {
      return tail[i];
    }
  }
  return null;
}

export function displayAssignedAgentFromMessages(
  messages: LostQaAgentMessageLike[],
  fallbackAssignedAgentEmail: string | null
): { value: string | null; source: "signature" | "email" | "none" } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if ((m.sender_role ?? "").trim().toLowerCase() !== "agent") continue;

    const signatureName = extractSignaturePersonName(m);
    if (signatureName) return { value: signatureName, source: "signature" };

    const email = (m.sender_email ?? "").trim();
    if (email) return { value: email, source: "email" };
  }

  const fallback = (fallbackAssignedAgentEmail ?? "").trim();
  if (fallback) return { value: fallback, source: "email" };
  return { value: null, source: "none" };
}

