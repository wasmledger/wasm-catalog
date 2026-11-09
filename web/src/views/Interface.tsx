// SPDX-License-Identifier: Apache-2.0
// Renders a contractspecv0 interface with the same model the CLI uses for README.md
// (../src/specmodel.ts). Every name, type and doc string is untrusted on-chain text:
// it is rendered as React text only (never HTML), in mono where it is code.
import { buildModel, isTupleStruct, rustType, type EnumEntry, type FnEntry, type SpecModel } from '../../../src/specmodel.ts';
import { EmptyState } from '../ui/kit';
import { Section } from '../ui/parts';

export function modelOf(entries: unknown[]): SpecModel {
  return buildModel(entries);
}

export function signature(f: FnEntry): string {
  const args = f.inputs.map((i) => `${i.name}: ${rustType(i.type)}`).join(', ');
  const out = f.outputs.length === 0 ? '' : f.outputs.length === 1 ? ` -> ${rustType(f.outputs[0]!)}` : ` -> (${f.outputs.map(rustType).join(', ')})`;
  return `fn ${f.name}(${args})${out}`;
}

function Doc({ text }: { text: string }) {
  if (!text.trim()) return null;
  return <p className="mt-1.5 max-w-prose whitespace-pre-wrap break-words text-sm text-ink-2">{text}</p>;
}

function Code({ children }: { children: string }) {
  return <pre className="code-block wrap-sm rounded-sm border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>;
}

function enumBody(e: EnumEntry): string {
  return e.cases.map((c) => `  ${c.name} = ${c.value},`).join('\n');
}

export function InterfaceView({ m }: { m: SpecModel }) {
  const typesCount = m.structs.length + m.unions.length + m.enums.length;
  return (
    <div>
      <Section title={`Functions (${m.functions.length})`} description="As the soroban-sdk author would have written them, from the wasm's contractspecv0 section.">
        {m.functions.length === 0 ? (
          <EmptyState title="No functions declared">The spec section is present but declares no functions.</EmptyState>
        ) : (
          <ul role="list" className="flex flex-col gap-4">
            {m.functions.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <Code>{signature(f)}</Code>
                <Doc text={f.doc} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {typesCount > 0 && (
        <Section title={`Types (${typesCount})`}>
          <ul role="list" className="flex flex-col gap-4">
            {m.structs.map((s, i) => (
              <li key={`s-${s.name}-${i}`}>
                <Code>
                  {isTupleStruct(s)
                    ? `struct ${s.name}(${s.fields.map((f) => rustType(f.type)).join(', ')});`
                    : `struct ${s.name} {\n${s.fields.map((f) => `  ${f.name}: ${rustType(f.type)},`).join('\n')}\n}`}
                </Code>
                <Doc text={s.doc} />
              </li>
            ))}
            {m.unions.map((u, i) => (
              <li key={`u-${u.name}-${i}`}>
                <Code>{`enum ${u.name} {\n${u.cases.map((c) => `  ${c.name}${c.types && c.types.length ? `(${c.types.map(rustType).join(', ')})` : ''},`).join('\n')}\n}`}</Code>
                <Doc text={u.doc} />
              </li>
            ))}
            {m.enums.map((e, i) => (
              <li key={`e-${e.name}-${i}`}>
                <Code>{`#[repr(u32)]\nenum ${e.name} {\n${enumBody(e)}\n}`}</Code>
                <Doc text={e.doc} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.errors.length > 0 && (
        <Section title={`Error enums (${m.errors.length})`}>
          <ul role="list" className="flex flex-col gap-4">
            {m.errors.map((e, i) => (
              <li key={`x-${e.name}-${i}`}>
                <Code>{`#[contracterror]\nenum ${e.name} {\n${enumBody(e)}\n}`}</Code>
                <Doc text={e.doc} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.events.length > 0 && (
        <Section title={`Events (${m.events.length})`} description="Declared SEP-48 events: prefix topics, then parameters and where each is published (topic or data).">
          <ul role="list" className="flex flex-col gap-4">
            {m.events.map((ev, i) => (
              <li key={`v-${ev.name}-${i}`}>
                <Code>
                  {`event ${ev.name}  topics [${ev.prefixTopics.map((t) => JSON.stringify(t)).join(', ')}]  data ${ev.dataFormat || 'unspecified'}\n${ev.params
                    .map((p) => `  ${p.name}: ${rustType(p.type)}  (${p.location || 'unspecified'})`)
                    .join('\n')}`}
                </Code>
                <Doc text={ev.doc} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.unknown.length > 0 && (
        <Section title={`Unrecognised entries (${m.unknown.length})`}>
          <p className="text-sm text-ink-2">The spec contains entry kinds this viewer does not render. They are in spec.json.</p>
        </Section>
      )}
    </div>
  );
}
