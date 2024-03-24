import {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
} from "https://deno.land/x/ts_morph/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { join, resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.208.0/fs/mod.ts";

await new Command()
  .name("styled2panda")
  .arguments("<projectDir:string>")
  .action(async (_, projectDir) => {
    const tsConfigFilePath = resolve(join(projectDir, "tsconfig.json"));
    if (!exists(tsConfigFilePath)) {
      return console.error("cannot find tsconfig.json");
    }
    const project = new Project({
      tsConfigFilePath,
      manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        quoteKind: QuoteKind.Single,
      },
    });
    for (const source of project.getSourceFiles()) {
      for (const variableDeclaration of source.getVariableDeclarations()) {
        const initializer = variableDeclaration.getInitializer();
        if (initializer?.isKind(SyntaxKind.TaggedTemplateExpression)) {
          const cssTemplate = initializer.getTemplate();
          if (Node.isNoSubstitutionTemplateLiteral(cssTemplate)) {
            const literal = cssTemplate.getLiteralValue();
            console.log(
              variableDeclaration.getName(),
              literal,
            );
            const obj = literalToObject(literal);
            if (!obj) continue;
            const tag = initializer.getTag();
            const objText = JSON.stringify(obj, null, 2);
            if (Node.isPropertyAccessExpression(tag)) {
              const tagName = tag.getName();
              if (obj.base && Object.keys(obj.base).length == 0) {
                variableDeclaration.setInitializer(
                  `styled('${tagName}')`,
                );
              } else {
                variableDeclaration.setInitializer(
                  `styled('${tagName}', ${objText})`,
                );
              }
              variableDeclaration.formatText();
              continue;
            }
            if (Node.isCallExpression(tag)) {
              const [argument] = tag.getArguments();
              console.log(argument.getText());
              if (obj.base && Object.keys(obj.base).length == 0) {
                variableDeclaration.setInitializer(
                  `styled(${argument.getText()})`,
                );
              } else {
                variableDeclaration.setInitializer(
                  `styled(${argument.getText()}, ${objText})`,
                );
              }
              variableDeclaration.formatText();
              continue;
            }
          }
          if (Node.isTemplateExpression(cssTemplate)) {
            // TODO
          }
        }
      }
    }

    await project.save();
  })
  .parse(Deno.args);

function toCamelCase(x: string): string {
  const [first, ...rest] = x.split("-");
  let result = first;
  for (const substr of rest) {
    result += substr[0].toUpperCase() + substr.substring(1);
  }
  return result;
}
function selectorToKey(sel: string): string {
  switch (sel) {
    case "&:focus":
      return "_focus";
    case "&:hover":
      return "_hover";
    case "&:active":
      return "_active";
    case "&::after":
      return "_after";
    case "&::before":
      return "_before";
    default:
      return sel;
  }
}
function literalToObject(literal: string) {
  const base: Record<string, unknown> = {};
  const obj: Record<string, unknown> = { base };
  const stack = [base];
  for (const line of literal.split("\n")) {
    const trimmed = line.trim();
    const nearest = stack[0];
    if (trimmed.endsWith(";")) {
      const [_, key, value] = trimmed.match(/(.+): (.+);/) ?? [];
      if (!key || !value) return console.log(`revert: ${trimmed}`);
      nearest[toCamelCase(key)] = value;
    }
    if (trimmed.endsWith("{")) {
      const [_, selector] = trimmed.match(/(.+) {/) ?? [];
      if (!selector) return console.log(`revert: ${trimmed}`);
      const key = selectorToKey(selector);
      const newObj: Record<string, unknown> = {};
      console.log(nearest);
      nearest[key] = newObj;
      stack.unshift(newObj);
    }
    if (trimmed.endsWith("}")) {
      stack.shift();
    }
  }
  return obj;
}
