import { defaultTemplateContent } from "@/lib/commercialProposal/content";
import { getTemplateString, templateBlocks } from "@/lib/commercialProposal/templateBlocks";
import { TEMPLATE_EDITOR_PAGES } from "@/lib/commercialProposal/templatePages";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const content = defaultTemplateContent();
const blocks = templateBlocks(content);
const ids = blocks.map((b) => b.id);

assert(new Set(ids).size === ids.length, "block IDs must be unique");

for (const page of TEMPLATE_EDITOR_PAGES) {
  assert(
    blocks.some((b) => b.pageId === page.id),
    `page ${page.id} has no blocks`
  );
}

const required = [
  "cover.title",
  "intro.greeting",
  "intro.body",
  "history.entries",
  "technology.block1.title",
  "technology.block1.text",
  "translation.description",
  "advantages.item1.title",
  "advantages.item1.text",
  "quality.step1.title",
  "quality.step1.text",
];
for (const id of required) {
  assert(ids.includes(id), `missing required block ${id}`);
}

for (const block of blocks) {
  if (block.kind !== "text") continue;
  const value = getTemplateString(content, block.path);
  assert(typeof value === "string", `${block.id} path is not a string`);
  assert(block.layout.width > 0 && block.layout.height > 0, `${block.id} layout is empty`);
}

assert(getTemplateString(content, ["cover", "title"]).includes("pasiūlymas"), "cover title path");
assert(getTemplateString(content, ["technology", "blocks", 0, "title"]).includes("greitesni"), "tech block path");
assert(getTemplateString(content, ["uniqueness", "blocks", 0, "title"]).length > 0, "advantages path");

console.log(`verify-cp-template-blocks: ok pages=${TEMPLATE_EDITOR_PAGES.length} blocks=${blocks.length}`);
