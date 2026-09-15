import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Post-processes a Meshy multi-color 3MF so the printed figure is exactly the
 * ordered height. 3MF uses Z-up millimetres, so height = Z extent.
 *
 * Meshy emits Bambu Studio's project layout:
 *   3D/3dmodel.model            root: one <object> made of <components>, each
 *                               pointing at a geometry part, plus a <build> item
 *   3D/Objects/object_N.model   geometry parts (vertices + triangles with the
 *                               per-triangle `paint_color` filament data)
 *   Metadata/model_settings.config, Metadata/project_settings.config
 *                               Bambu extruder / filament assignments
 *
 * Scaling rewrites vertex coordinates in every geometry part with ONE global
 * scale about ONE global anchor, so multiple parts keep their relative
 * placement. Triangles, paint_color attributes and all metadata are untouched,
 * which is what keeps the colors intact in Bambu Studio.
 *
 * Only translations are accepted in component/build transforms. A rotation or
 * scale there would make a plain vertex rewrite wrong, so such files are
 * rejected with an explicit error and the operator scales them in the slicer.
 */

const ROOT_MODEL = "3D/3dmodel.model";
const GEOMETRY_PART_PATTERN = /^3D\/Objects\/[^/]+\.model$/i;
const TRANSFORM_EPSILON = 1e-6;
const VERTEX_PATTERN = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g;

/** Files already within this relative tolerance of the target are still rewritten, but logged as a no-op. */
export const HEIGHT_TOLERANCE = 0.02;

export class ThreeMfUnsupportedError extends Error {
  constructor(reason: string) {
    super(
      `3MF needs manual scaling in the slicer: ${reason}. Download the Meshy 3MF and set the height to the ordered size by hand.`
    );
    this.name = "ThreeMfUnsupportedError";
  }
}

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3; count: number };

function parseNumber(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid 3MF number '${value}'.`);
  return number;
}

/** 3MF transform = 12 numbers: 3x3 matrix (row-major, first 9) + translation (last 3). Returns translation if the 3x3 is identity. */
function translationOf(transform: string | undefined, where: string): Vec3 {
  if (!transform) return [0, 0, 0];
  const n = transform.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((v) => !Number.isFinite(v))) {
    throw new ThreeMfUnsupportedError(`${where} has an unreadable transform "${transform}"`);
  }
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let i = 0; i < 9; i++) {
    if (Math.abs(n[i] - identity[i]) > TRANSFORM_EPSILON) {
      throw new ThreeMfUnsupportedError(`${where} has a rotation/scale transform "${transform}"`);
    }
  }
  return [n[9], n[10], n[11]];
}

function normalizePartPath(path: string) {
  return path.replace(/^\//, "");
}

/** Geometry parts referenced from the root model, with their accumulated translation. */
function resolveParts(archive: Record<string, Uint8Array>) {
  const rootBytes = archive[ROOT_MODEL];
  if (!rootBytes) throw new Error(`3MF has no ${ROOT_MODEL}.`);
  const root = strFromU8(rootBytes);

  // Build items: which root objects are placed on the plate, and where.
  const items = [...root.matchAll(/<item\b([^>]*)\/>/gi)].map((m) => m[1]);
  if (items.length === 0) throw new Error("3MF root has no <build> items.");
  if (items.length > 1) throw new ThreeMfUnsupportedError(`root has ${items.length} build items`);
  const itemObjectId = /\bobjectid="([^"]+)"/.exec(items[0])?.[1];
  const itemTranslation = translationOf(/\btransform="([^"]*)"/.exec(items[0])?.[1], "<item>");

  // The root object either embeds a mesh directly or is assembled from components.
  const objectMatch = new RegExp(`<object\\b[^>]*\\bid="${itemObjectId}"[^>]*>([\\s\\S]*?)</object>`, "i").exec(root);
  if (!objectMatch) throw new Error(`3MF root object ${itemObjectId} not found.`);
  const objectBody = objectMatch[1];

  const parts: { path: string; translation: Vec3 }[] = [];
  if (/<mesh\b/i.test(objectBody)) {
    parts.push({ path: ROOT_MODEL, translation: itemTranslation });
  }
  for (const c of objectBody.matchAll(/<component\b([^>]*)\/>/gi)) {
    const path = /\bp:path="([^"]+)"/.exec(c[1])?.[1];
    if (!path) throw new ThreeMfUnsupportedError("component without p:path (in-file component references)");
    const t = translationOf(/\btransform="([^"]*)"/.exec(c[1])?.[1], "<component>");
    parts.push({
      path: normalizePartPath(path),
      translation: [t[0] + itemTranslation[0], t[1] + itemTranslation[1], t[2] + itemTranslation[2]],
    });
  }
  if (parts.length === 0) throw new Error("3MF root object has neither a mesh nor components.");

  for (const part of parts) {
    if (!archive[part.path]) throw new Error(`3MF references missing part ${part.path}.`);
    if (part.path !== ROOT_MODEL && !GEOMETRY_PART_PATTERN.test(part.path)) {
      throw new ThreeMfUnsupportedError(`unexpected part location ${part.path}`);
    }
    const xml = strFromU8(archive[part.path]);
    if (part.path !== ROOT_MODEL && /<components?\b/i.test(xml)) {
      throw new ThreeMfUnsupportedError(`${part.path} contains nested components`);
    }
  }
  return parts;
}

function measure(xml: string, translation: Vec3, into: Bounds) {
  VERTEX_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VERTEX_PATTERN.exec(xml))) {
    const x = parseNumber(match[1]) + translation[0];
    const y = parseNumber(match[2]) + translation[1];
    const z = parseNumber(match[3]) + translation[2];
    if (x < into.min[0]) into.min[0] = x;
    if (x > into.max[0]) into.max[0] = x;
    if (y < into.min[1]) into.min[1] = y;
    if (y > into.max[1]) into.max[1] = y;
    if (z < into.min[2]) into.min[2] = z;
    if (z > into.max[2]) into.max[2] = z;
    into.count += 1;
  }
}

/** Filament palette (hex) from Bambu project settings, if present. */
export function readFilamentPalette(archive: Record<string, Uint8Array>): string[] {
  const bytes = archive["Metadata/project_settings.config"];
  if (!bytes) return [];
  try {
    const json = JSON.parse(strFromU8(bytes)) as { filament_colour?: unknown };
    if (!Array.isArray(json.filament_colour)) return [];
    return json.filament_colour
      .filter((c): c is string => typeof c === "string")
      .map((c) => (c.length === 9 && c.startsWith("#") ? c.slice(0, 7) : c).toUpperCase());
  } catch {
    return [];
  }
}

/** Bambu Studio preset names the 3MF should open with. */
export type BambuTarget = {
  /** Vendor model name exactly as Bambu Studio shows it, e.g. "Bambu Lab A1". */
  printerModel: string;
  /** Profile code used in system preset names: A1, A1M, P1P, P1S, X1C, X1E, H2D. */
  profileCode: string;
  nozzleDiameter: string;
  /** Optional explicit preset names; derived from the fields above when omitted. */
  printerSettingsId?: string;
  printSettingsId?: string;
  filamentSettingsId?: string;
};

export function bambuTargetFromEnv(env: NodeJS.ProcessEnv = process.env): BambuTarget | null {
  const printerModel = env.BAMBU_PRINTER_MODEL?.trim();
  if (!printerModel) return null;
  const derivedCode = printerModel
    .replace(/^Bambu Lab\s*/i, "")
    .replace(/\s+mini$/i, "M")
    .replace(/\s+/g, "");
  return {
    printerModel,
    profileCode: env.BAMBU_PROFILE_CODE?.trim() || derivedCode,
    nozzleDiameter: env.BAMBU_NOZZLE_DIAMETER?.trim() || "0.4",
    printerSettingsId: env.BAMBU_PRINTER_SETTINGS_ID?.trim() || undefined,
    printSettingsId: env.BAMBU_PRINT_SETTINGS_ID?.trim() || undefined,
    filamentSettingsId: env.BAMBU_FILAMENT_SETTINGS_ID?.trim() || undefined,
  };
}

/**
 * Makes Metadata/project_settings.config a config Bambu Studio will actually
 * load.
 *
 * Meshy writes only the filament palette and wipe-tower keys — no
 * `printer_model`, no `nozzle_diameter`. Bambu Studio rejects such a config
 * (Plater.cpp: is_bbl_vendor_config + check_project_config), falls back to
 * "load geometry only", and the model then shows with a single default
 * filament: the whole figure in one colour, even though the per-triangle
 * paint data is intact.
 *
 * Writing the system preset names for the operator's printer lets Bambu select
 * those presets outright, so the project opens on the right machine with every
 * filament slot and its colour attached.
 */
function retargetBambuProject(archive: Record<string, Uint8Array>, target: BambuTarget | null | undefined) {
  if (!target) return false;
  const bytes = archive["Metadata/project_settings.config"];
  if (!bytes) return false;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(strFromU8(bytes));
  } catch {
    return false;
  }

  const colours = Array.isArray(json.filament_colour) ? (json.filament_colour as unknown[]) : [];
  const filamentCount = Math.max(colours.length, 1);
  const code = target.profileCode;

  json.printer_model = target.printerModel;
  json.printer_variant = target.nozzleDiameter;
  json.nozzle_diameter = [target.nozzleDiameter];
  json.printer_settings_id = target.printerSettingsId || `${target.printerModel} ${target.nozzleDiameter} nozzle`;
  json.print_settings_id = target.printSettingsId || `0.20mm Standard @BBL ${code}`;
  const filamentPreset = target.filamentSettingsId || `Bambu PLA Basic @BBL ${code}`;
  json.filament_settings_id = Array.from({ length: filamentCount }, () => filamentPreset);
  // One entry for print + one per filament + one for printer.
  // Empty string = "identical to the system preset", so Bambu takes the system values.
  json.different_settings_to_system = Array.from({ length: filamentCount + 2 }, () => "");
  json.inherits_group = Array.from({ length: filamentCount + 2 }, () => "");

  archive["Metadata/project_settings.config"] = strToU8(JSON.stringify(json, null, 4));
  return true;
}

export function resizeThreeMfToHeight(
  input: Uint8Array,
  targetHeightMm: number,
  options: { bambuTarget?: BambuTarget | null } = {}
) {
  if (!Number.isFinite(targetHeightMm) || targetHeightMm <= 0) {
    throw new Error("Invalid 3MF target height.");
  }

  let expanded = 0;
  let entries = 0;
  const archive = unzipSync(input, { filter(file) {
    expanded += file.originalSize;
    if (++entries > 2048 || expanded > 384 * 1024 * 1024) throw new ThreeMfUnsupportedError("archive exceeds processing budget");
    return true;
  } });
  const parts = resolveParts(archive);

  const bounds: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 };
  const xmlByPath = new Map<string, string>();
  for (const part of parts) {
    const xml = strFromU8(archive[part.path]);
    xmlByPath.set(part.path, xml);
    measure(xml, part.translation, bounds);
  }
  if (!bounds.count || !Number.isFinite(bounds.min[2]) || !Number.isFinite(bounds.max[2])) {
    throw new Error("Could not read vertices from 3MF geometry.");
  }

  const currentHeightMm = bounds.max[2] - bounds.min[2];
  if (!(currentHeightMm > 0)) throw new Error("3MF geometry has zero height.");

  const scale = targetHeightMm / currentHeightMm;
  const alreadyCorrect = Math.abs(scale - 1) <= HEIGHT_TOLERANCE;
  // Anchor: XY centre, bottom Z — the figure grows in place and stays on the plate.
  const anchor: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, bounds.min[2]];

  for (const part of parts) {
    const xml = xmlByPath.get(part.path)!;
    const [tx, ty, tz] = part.translation;
    // Global position g = local + t; scaled g' = anchor + (g - anchor) * s; local' = g' - t.
    const resized = xml.replace(VERTEX_PATTERN, (_whole, xs: string, ys: string, zs: string) => {
      const nx = anchor[0] + (parseNumber(xs) + tx - anchor[0]) * scale - tx;
      const ny = anchor[1] + (parseNumber(ys) + ty - anchor[1]) * scale - ty;
      const nz = anchor[2] + (parseNumber(zs) + tz - anchor[2]) * scale - tz;
      return `<vertex x="${nx.toFixed(4)}" y="${ny.toFixed(4)}" z="${nz.toFixed(4)}"/>`;
    });
    archive[part.path] = strToU8(resized);
  }
  xmlByPath.clear();

  const retargeted = retargetBambuProject(archive, options.bambuTarget);
  const palette = readFilamentPalette(archive);
  const output = zipSync(archive, { level: 6 });

  return {
    bytes: output,
    parts: parts.map((p) => p.path),
    currentHeightMm,
    targetHeightMm,
    scale,
    alreadyCorrect,
    vertexCount: bounds.count,
    palette,
    retargeted,
  };
}
