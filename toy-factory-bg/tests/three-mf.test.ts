import { describe, it, expect } from "vitest";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { MASTER_FILAMENT_PALETTE, nearestMasterFilamentColour, resizeThreeMfToHeight } from "@/lib/three-mf";

function fixture(transform = "") {
  return zipSync({
    "3D/3dmodel.model": strToU8(`<model unit="millimeter"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="10" z="50"/></vertices><triangles><triangle v1="0" v2="1" v3="0" paint_color="1"/></triangles></mesh></object></resources><build><item objectid="1" ${transform}/></build></model>`),
    "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: ["#FF0000FF", "#00FF00"] })),
  });
}
describe("print geometry", () => {
  it.each([100, 150, 200])("outputs exactly %s mm and preserves paint", (height) => {
    const result = resizeThreeMfToHeight(fixture(), height);
    const xml = strFromU8(unzipSync(result.bytes)["3D/3dmodel.model"]);
    expect(result.scale).toBe(height / 50);
    expect(xml).toContain(`z="${height.toFixed(4)}"`);
    expect(xml).toContain('paint_color="1"');
    expect(result.palette).toEqual(["#D62828", "#2E7D32"]);
  });
  it("maps generated colours to the fixed production palette", () => {
    expect(MASTER_FILAMENT_PALETTE).toHaveLength(20);
    expect(nearestMasterFilamentColour("#FA1010")).toBe("#D62828");
    expect(nearestMasterFilamentColour("#123B99")).toBe("#1E3A8A");
  });
  it("rejects rotated geometry instead of silently printing the wrong height", () => {
    expect(() => resizeThreeMfToHeight(fixture('transform="0 1 0 1 0 0 0 0 1 0 0 0"'), 100)).toThrow("rotation/scale");
  });
  it("writes the printer preset while keeping the palette", () => {
    const output = resizeThreeMfToHeight(fixture(), 100, { bambuTarget: { printerModel: "Bambu Lab A1", profileCode: "A1", nozzleDiameter: "0.4" } });
    const config = JSON.parse(strFromU8(unzipSync(output.bytes)["Metadata/project_settings.config"]));
    expect(config.printer_model).toBe("Bambu Lab A1");
    expect(config.filament_settings_id).toHaveLength(2);
  });
});
