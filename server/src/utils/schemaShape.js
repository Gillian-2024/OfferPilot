import {
  ZodObject,
  ZodArray,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodOptional,
  ZodNullable,
} from 'zod';

// 把 zod schema 递归转成「可读 JSON 骨架文本」注入 prompt，
// 让模型在不依赖 tool_use 的情况下也能输出字段名/嵌套/类型都对的 JSON。
// 配合 generateText + 手动 parse 使用（generateObject tool mode 对内网 reasoning 模型失效）。

// 解包 Optional / Nullable
function unwrap(schema) {
  if (schema instanceof ZodOptional || schema instanceof ZodNullable) {
    return unwrap(schema.unwrap());
  }
  return schema;
}

function descOf(schema) {
  return (schema && schema._def && schema._def.description) || '';
}

function shapeOf(schema, indent) {
  const pad = '  '.repeat(indent);
  const d = descOf(schema);
  const note = d ? `  // ${d}` : '';
  const s = unwrap(schema);

  if (s instanceof ZodObject) {
    const fields = Object.entries(s.shape).map(
      ([k, v]) => `${pad}  "${k}": ${shapeOf(v, indent + 1)}`
    );
    return `{\n${fields.join(',\n')}\n${pad}}${note}`;
  }
  if (s instanceof ZodArray) {
    return `[${shapeOf(s.element, indent)}]${note}`;
  }
  if (s instanceof ZodString) return `"string"${note}`;
  if (s instanceof ZodNumber) return `"number"${note}`;
  if (s instanceof ZodBoolean) return `"boolean"${note}`;
  return `"string"${note}`;
}

export function schemaShape(schema) {
  return shapeOf(schema, 0);
}
