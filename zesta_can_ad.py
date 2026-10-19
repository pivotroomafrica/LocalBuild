# ZESTA - Cinematic CGI beverage can advertisement for Blender
# =============================================================
# Paste into Blender's  Scripting > Text Editor  and press  Run Script  (Alt+P).
# Targets Blender 4.2 LTS or newer (written/tested against the 5.x Python API too).
#
# What it builds (all re-runnable - previous ZESTA objects are removed first):
#   PRODUCT      CAN_Body, CAN_UpperRim, CAN_Lid, CAN_PullTab, CAN_DrinkingAperture,
#                CAN_LowerRim_Base, CAN_Condensation
#   LABEL        LABEL_Print (UV-mapped, procedural print shader) + real text/logo
#                geometry wrapped onto the cylinder (no stretching, no flat decal)
#   LIQUID       hybrid splash: crown sheet, two wave sheets, tendrils, droplets, pool
#   ENVIRONMENT  curved studio cyclorama with glossy floor
#   LIGHTING     key softbox, strip rims, backlight, fill, splash accents, bg glow
#   CAMERAS      CAM_Hero (16:9), CAM_Hero_Vertical (9:16 reframed), CAM_Detail
#   SIMULATION   optional Mantaflow liquid domain / flow / collider (OFF by default)
#
# Animation: 11 s @ 30 fps (frames 1-331). Establish -> rotate to hero -> splash
# expands -> hero hold with label facing camera.
#
# Command-line use (optional):
#   blender -b -P zesta_can_ad.py -- --out /path/dir --still
#   blender -b -P zesta_can_ad.py -- --out /path/dir --animation --final
#   flags: --final  --vertical  --still  --animation  --eevee  --fluid

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Matrix, Vector

# =============================================================================
# CONFIG  - edit these
# =============================================================================
CONFIG = {
    "OUTPUT_DIR": os.path.join(os.path.expanduser("~"), "ZestaCanAd"),
    "BLEND_NAME": "zesta_can_ad.blend",
    "SAVE_BLEND": True,

    "ENGINE": "CYCLES",          # "CYCLES" (final, recommended) or "EEVEE" (fast preview)
    "QUALITY": "PREVIEW",        # "PREVIEW" (50% res, low samples) or "FINAL" (1080p, high samples)
    "VERTICAL": False,           # True -> 1080x1920 using CAM_Hero_Vertical

    "FPS": 30,
    "DURATION_SEC": 11.0,
    "HERO_SEC": 8.0,             # moment the label faces the camera and splash is complete

    "BRAND": "ZESTA",
    "FLAVOR": "CITRUS SURGE",
    "SUBLINE": "SPARKLING LIME & YUZU",
    "SIZE_TEXT": "440 ML  -  ZERO SUGAR",

    "SEED": 7,                   # change for a different splash / droplet layout
    "LIGHT_SCALE": 1.0,          # global light multiplier - the one knob for exposure
    "CONDENSATION": True,
    "USE_FLUID_SIM": False,      # True enables the optional Mantaflow domain (needs manual bake)

    "RENDER_STILL": False,       # render a preview still when the script finishes
    "RENDER_ANIMATION": False,   # render the animation when the script finishes
}

# Command-line overrides
_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--out" in _argv:
    CONFIG["OUTPUT_DIR"] = _argv[_argv.index("--out") + 1]
if "--final" in _argv:
    CONFIG["QUALITY"] = "FINAL"
if "--vertical" in _argv:
    CONFIG["VERTICAL"] = True
if "--eevee" in _argv:
    CONFIG["ENGINE"] = "EEVEE"
if "--fluid" in _argv:
    CONFIG["USE_FLUID_SIM"] = True
if "--still" in _argv:
    CONFIG["RENDER_STILL"] = True
if "--animation" in _argv:
    CONFIG["RENDER_ANIMATION"] = True

# =============================================================================
# Constants / helpers
# =============================================================================
S = 0.01                          # geometry is authored in centimetres, scene is in metres
R_BODY = 3.3                      # 66 mm diameter
CAN_H = 15.0                      # 150 mm tall
LABEL_Z0, LABEL_Z1 = 2.4, 11.8    # label band (cm)
R_LABEL = R_BODY + 0.012
FRONT = -math.pi / 2              # direction the label faces (towards -Y, the camera)
FPS = CONFIG["FPS"]
END_FRAME = int(round(CONFIG["DURATION_SEC"] * FPS)) + 1
HERO_FRAME = int(round(CONFIG["HERO_SEC"] * FPS)) + 1

COLLECTIONS = ["PRODUCT", "LABEL", "LIQUID", "ENVIRONMENT", "LIGHTING", "CAMERAS", "SIMULATION"]
NAME_PREFIXES = ("CAN_", "LABEL_", "LIQUID_", "ENV_", "LIGHT_", "CAM_", "SIM_", "MAT_", "ZESTA_", "TMP_")

scene = bpy.context.scene
RNG = random.Random(CONFIG["SEED"])


def s2f(seconds):
    return int(round(seconds * FPS)) + 1


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def ang_dist(a, b):
    """Absolute angular distance 0..pi."""
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def warn(msg):
    print("[ZESTA][warn] " + msg)


def info(msg):
    print("[ZESTA] " + msg)


def safe_set(obj, **attrs):
    """Set attributes, skipping any that this Blender version does not have."""
    for k, v in attrs.items():
        try:
            setattr(obj, k, v)
        except (AttributeError, TypeError, ValueError, RuntimeError):
            warn("could not set %s.%s = %r" % (type(obj).__name__, k, v))


# =============================================================================
# Scene cleanup (re-runnable) and collections
# =============================================================================
def clear_previous():
    for n in ("Cube", "Camera", "Light"):      # default startup scene objects
        ob = bpy.data.objects.get(n)
        if ob and ob.users_collection:
            bpy.data.objects.remove(ob, do_unlink=True)
    for cname in COLLECTIONS:
        coll = bpy.data.collections.get(cname)
        if coll:
            for ob in list(coll.all_objects):
                bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.collections.remove(coll)
    for ob in list(bpy.data.objects):
        if ob.name.startswith(NAME_PREFIXES):
            bpy.data.objects.remove(ob, do_unlink=True)
    for attr in ("meshes", "curves", "lights", "cameras", "materials", "images", "worlds"):
        block = getattr(bpy.data, attr)
        for item in list(block):
            if item.name.startswith(NAME_PREFIXES) and item.users == 0:
                block.remove(item)


def make_collections():
    out = {}
    for cname in COLLECTIONS:
        c = bpy.data.collections.new(cname)
        scene.collection.children.link(c)
        out[cname] = c
    return out


def link(obj, coll, parent=None):
    coll.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def bm_to_object(bm, name, coll, parent=None, scale=S, smooth=True):
    if scale != 1.0:
        bmesh.ops.scale(bm, vec=(scale, scale, scale), verts=bm.verts)
    if smooth:
        for f in bm.faces:
            f.smooth = True
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return link(bpy.data.objects.new(name, mesh), coll, parent)


def add_modifier(obj, mtype, name, **kw):
    try:
        m = obj.modifiers.new(name, mtype)
        safe_set(m, **kw)
        return m
    except (RuntimeError, TypeError) as e:
        warn("modifier %s failed: %s" % (mtype, e))


def weighted_normals(obj):
    add_modifier(obj, "WEIGHTED_NORMAL", "WeightedNormal", keep_sharp=True, weight=50)


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# =============================================================================
# Geometry builders
# =============================================================================
def catmull(points, n=8):
    """Smooth an open 2D polyline through its control points."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t +
                       (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 +
                       (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)
                for a in (0, 1)))
    out.append(tuple(points[-1]))
    return out


def revolve_bm(profile, segs=128, start_angle=0.0, flip=False, bm=None):
    """Revolve an (r, z) profile around Z. Normal = dz*r_hat - dr*z_hat (flip reverses)."""
    bm = bm or bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for j in range(segs):
            a = start_angle + 2 * math.pi * j / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(profile) - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            vs = [rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]]
            if flip:
                vs.reverse()
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return bm


def parametric_sheet(cols, rows, fn, closed):
    """Grid surface from fn(u, v) -> (x, y, z); u wraps if closed."""
    bm = bmesh.new()
    ncols = cols if closed else cols + 1
    grid = [[bm.verts.new(fn(i / cols, j / rows)) for i in range(ncols)] for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols if closed else cols):
            i2 = (i + 1) % ncols
            try:
                bm.faces.new((grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i]))
            except ValueError:
                pass
    return bm


# ------------------------------- the can -------------------------------------
def build_can(colls, mats):
    prod = colls["PRODUCT"]
    root = link(bpy.data.objects.new("CAN_Root", None), prod)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.05

    # --- body: straight wall + smooth neck taper -------------------------------
    prof = [(R_BODY, 1.3), (R_BODY, 12.4)]
    for k in range(1, 29):
        s = k / 28
        z = lerp(12.4, 14.5, s)
        smooth = s * s * (3 - 2 * s)
        prof.append((lerp(R_BODY, 2.6, smooth), z))
    obj = bm_to_object(revolve_bm(prof, 160), "CAN_Body", prod, root)
    set_material(obj, mats["body"])
    weighted_normals(obj)
    add_modifier(obj, "SOLIDIFY", "Thickness", thickness=-0.00012, offset=-1)

    # --- rolled top rim (torus) -------------------------------------------------
    circ = [(2.6 + 0.3 * math.cos(a), 14.7 + 0.3 * math.sin(a))
            for a in [2 * math.pi * k / 32 for k in range(33)]]
    obj = bm_to_object(revolve_bm(circ, 160), "CAN_UpperRim", prod, root)
    set_material(obj, mats["rim"])

    # --- lid: recessed panel with countersink bead ---------------------------
    lid = catmull([(0, 14.25), (1.5, 14.25), (1.85, 14.255), (1.98, 14.30), (2.08, 14.30),
                   (2.16, 14.22), (2.28, 14.40), (2.34, 14.62), (2.36, 14.70)], 6)
    obj = bm_to_object(revolve_bm(lid, 160, flip=True), "CAN_Lid", prod, root)
    set_material(obj, mats["lid"])
    weighted_normals(obj)

    # --- lower rim + recessed dome base -------------------------------------
    low = catmull([(R_BODY, 1.3), (3.28, 0.95), (3.18, 0.60), (2.98, 0.30), (2.72, 0.10),
                   (2.55, 0.00), (2.38, 0.08), (2.25, 0.30), (2.00, 0.65), (1.50, 0.95),
                   (0.80, 1.15), (0.0, 1.20)], 6)
    obj = bm_to_object(revolve_bm(low, 160, flip=True), "CAN_LowerRim_Base", prod, root)
    set_material(obj, mats["rim"])

    # --- drinking aperture ----------------------------------------------------
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=1.0, segments=48,
                            matrix=Matrix.Translation((0.95, 0, 14.253)) @
                                   Matrix.Diagonal((0.9, 0.62, 1.0, 1.0)))
    obj = bm_to_object(bm, "CAN_DrinkingAperture", prod, root)
    set_material(obj, mats["aperture"])
    add_modifier(obj, "SOLIDIFY", "Thickness", thickness=0.0002, offset=-1)

    # --- pull tab: finger ring + plate + rivet -----------------------------------
    bm = bmesh.new()
    ring_prof = [(0.65 + 0.10 * math.cos(a), 0.10 * math.sin(a))
                 for a in [2 * math.pi * k / 20 for k in range(21)]]
    revolve_bm(ring_prof, 64, bm=bm)
    for v in bm.verts:
        v.co.y *= 1.2
        v.co.x -= 1.15
        v.co.z += 14.40
    # stadium plate
    outline = []
    for k in range(13):
        a = -math.pi / 2 + math.pi * k / 12
        outline.append((1.0 + 0.5 * math.cos(a), 0.5 * math.sin(a)))
    for k in range(13):
        a = math.pi / 2 + math.pi * k / 12
        outline.append((-0.5 + 0.5 * math.cos(a), 0.5 * math.sin(a)))
    pv = [bm.verts.new((x, y, 14.40)) for (x, y) in outline]
    face = bm.faces.new(pv)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, 0.09), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # rivet
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.22, radius2=0.22, depth=0.2,
                          matrix=Matrix.Translation((0.0, 0, 14.34)))
    obj = bm_to_object(bm, "CAN_PullTab", prod, root)
    set_material(obj, mats["tab"])
    add_modifier(obj, "BEVEL", "Edge", width=0.0004, segments=3, limit_method="ANGLE")
    return root


# ------------------------------- label ---------------------------------------
def text_mesh_cm(text, size, extrude, spacing=1.0):
    """Return a bmesh (centimetres, centred on origin, in XY plane) of the given text."""
    cu = bpy.data.curves.new("TMP_text", "FONT")
    cu.body = text
    cu.size = size
    cu.extrude = extrude
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    safe_set(cu, space_character=spacing)
    tmp = bpy.data.objects.new("TMP_text_obj", cu)
    scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    return bm


def densify(bm, max_len):
    for _ in range(6):
        long_edges = [e for e in bm.edges if e.calc_length() > max_len]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])


def wrap_to_can(bm, zc, base_r=R_LABEL, x_offset=0.0):
    """Bend a flat (x,y,z) mesh around the can front. x -> arc length, y -> height, z -> out."""
    for v in bm.verts:
        th = (v.co.x + x_offset) / base_r
        rr = base_r + v.co.z
        v.co = Vector((rr * math.sin(th), -rr * math.cos(th), zc + v.co.y))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def extrude_up(bm, t):
    ext = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    top = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, t), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def build_label(colls, mats, root):
    lab = colls["LABEL"]
    # printed band (UV-mapped cylinder with a hair of thickness)
    prof = [(R_BODY, LABEL_Z0), (R_LABEL, LABEL_Z0), (R_LABEL, LABEL_Z1), (R_BODY, LABEL_Z1)]
    bm = bmesh.new()
    # build in 3 separate runs so the printed face gets a clean 0..1 UV
    revolve_bm(prof, 192, start_angle=math.pi / 2, bm=bm)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            a = (math.atan2(co.y, co.x) - math.pi / 2) % (2 * math.pi)
            u = a / (2 * math.pi)
            # faces on the seam: fix wrap-around
            cen = f.calc_center_median()
            ac = (math.atan2(cen.y, cen.x) - math.pi / 2) % (2 * math.pi) / (2 * math.pi)
            if abs(u - ac) > 0.5:
                u += 1.0 if ac > u else -1.0
            loop[uvl].uv = (u, (co.z - LABEL_Z0) / (LABEL_Z1 - LABEL_Z0))
    obj = bm_to_object(bm, "LABEL_Print", lab, root)
    set_material(obj, mats["label"])

    zspan = LABEL_Z1 - LABEL_Z0

    def place_text(name, text, size, z, mat, extrude=0.02, spacing=1.0, max_len=0.12):
        bm = text_mesh_cm(text, size, extrude, spacing)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        densify(bm, max_len)
        for v in bm.verts:
            v.co.z += extrude + 0.0    # lift so the glyph sits fully on the label
        wrap_to_can(bm, z)
        o = bm_to_object(bm, name, lab, root)
        set_material(o, mat)
        return o

    place_text("LABEL_Brand", CONFIG["BRAND"], 1.95, 7.75, mats["t_brand"], 0.03, 1.06, 0.14)
    place_text("LABEL_Flavor", CONFIG["FLAVOR"], 0.70, 6.15, mats["t_flavor"], 0.02, 1.08, 0.10)
    place_text("LABEL_Subline", CONFIG["SUBLINE"], 0.36, 5.35, mats["t_white"], 0.015, 1.12, 0.08)
    place_text("LABEL_Volume", CONFIG["SIZE_TEXT"], 0.30, 3.45, mats["t_white"], 0.015, 1.12, 0.08)

    # citrus-slice logo mark
    bm = bmesh.new()
    cz = 10.15
    n_seg, inner, outer = 8, 0.22, 0.78
    for k in range(n_seg):
        a0 = 2 * math.pi * k / n_seg + math.radians(5)
        a1 = 2 * math.pi * (k + 1) / n_seg - math.radians(5)
        pts = []
        steps = 6
        for s in range(steps + 1):
            a = lerp(a0, a1, s / steps)
            pts.append((outer * math.cos(a), outer * math.sin(a)))
        for s in range(steps, -1, -1):
            a = lerp(a0, a1, s / steps)
            pts.append((inner * math.cos(a), inner * math.sin(a)))
        try:
            bm.faces.new([bm.verts.new((x, y, 0)) for (x, y) in pts])
        except ValueError:
            pass
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    extrude_up(bm, 0.03)
    densify(bm, 0.1)
    wrap_to_can(bm, cz)
    o = bm_to_object(bm, "LABEL_LogoWedges", lab, root)
    set_material(o, mats["t_logo"])

    bm = bmesh.new()
    ro, ri, steps = 0.98, 0.90, 72
    outer_v = [bm.verts.new((ro * math.cos(2 * math.pi * k / steps),
                             ro * math.sin(2 * math.pi * k / steps), 0)) for k in range(steps)]
    inner_v = [bm.verts.new((ri * math.cos(2 * math.pi * k / steps),
                             ri * math.sin(2 * math.pi * k / steps), 0)) for k in range(steps)]
    for k in range(steps):
        k2 = (k + 1) % steps
        bm.faces.new((outer_v[k], outer_v[k2], inner_v[k2], inner_v[k]))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    extrude_up(bm, 0.03)
    densify(bm, 0.1)
    wrap_to_can(bm, cz)
    o = bm_to_object(bm, "LABEL_LogoRing", lab, root)
    set_material(o, mats["t_white"])


# ------------------------------- condensation ----------------------------------
def build_condensation(colls, mats, root):
    rng = random.Random(CONFIG["SEED"] + 100)
    bm = bmesh.new()
    placed = []

    def try_drop(r, elong, subdiv):
        for _ in range(40):
            th = rng.uniform(0, 2 * math.pi)
            z = rng.uniform(1.6, 12.2)
            # keep the brand / flavour block clean
            arc = ang_dist(th, FRONT) * R_BODY
            if arc < 3.5 and 5.0 < z < 9.3:
                continue
            ok = True
            for (t2, z2, r2) in placed:
                d = math.hypot(ang_dist(th, t2) * R_BODY, z - z2)
                if d < (r + r2) * 1.15:
                    ok = False
                    break
            if not ok:
                continue
            placed.append((th, z, r * max(1.0, elong)))
            n = Vector((math.cos(th), math.sin(th), 0))
            up = Vector((0, 0, 1))
            xa = up.cross(n)
            rz = r * 0.55
            basis = Matrix(((xa.x, up.x, n.x), (xa.y, up.y, n.y), (xa.z, up.z, n.z))).to_4x4()
            pos = n * (R_BODY + rz * 0.35) + Vector((0, 0, z - (elong - 1) * r * 0.3))
            M = Matrix.Translation(pos) @ basis @ Matrix.Diagonal((r, r * elong, rz, 1.0))
            bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0, matrix=M)
            return

    for _ in range(14):
        try_drop(rng.uniform(0.13, 0.20), rng.uniform(1.2, 2.4), 2)     # large, running
    for _ in range(60):
        try_drop(rng.uniform(0.07, 0.12), rng.uniform(1.0, 1.4), 2)
    for _ in range(300):
        try_drop(rng.uniform(0.025, 0.065), rng.uniform(1.0, 1.15), 1)
    obj = bm_to_object(bm, "CAN_Condensation", colls["PRODUCT"], root)
    set_material(obj, mats["drops"])


# ------------------------------- liquid ----------------------------------------
def build_liquid(colls, mats):
    liq = colls["LIQUID"]
    rng = random.Random(CONFIG["SEED"])
    root = link(bpy.data.objects.new("LIQUID_Root", None), liq)
    root.empty_display_type = "SPHERE"
    root.empty_display_size = 0.02

    ph = [rng.uniform(0, 6.28) for _ in range(4)]
    RC = R_BODY + 0.35

    def front_weight(th):
        return smoothstep(0.30, 0.80, ang_dist(th, FRONT) / math.pi)

    # ---- crown: closed ring sheet, low in front of the label --------------------
    def crown(u, v):
        th = 2 * math.pi * u
        w = front_weight(th)
        n = 0.5 * math.sin(5 * th + ph[0]) + 0.3 * math.sin(9 * th + ph[1]) + 0.2 * math.sin(13 * th + ph[2])
        tip = max(0.0, n) ** 1.5
        H = 1.2 + w * (3.2 + 3.8 * (0.5 + 0.5 * n) + 2.6 * tip)
        t = v
        flare = 0.7 + 2.4 * w
        r = RC + flare * t ** 1.3 + 0.35 * math.sin(math.pi * t) + 1.1 * w * t ** 3
        return (r * math.cos(th) * S, r * math.sin(th) * S, t * H * S)

    bm = parametric_sheet(160, 26, crown, True)
    o = bm_to_object(bm, "LIQUID_Crown", liq, root)
    set_material(o, mats["liquid"])
    add_modifier(o, "SOLIDIFY", "Thickness", thickness=0.0012, offset=0)
    add_modifier(o, "SUBSURF", "Smooth", levels=1, render_levels=2)

    # ---- two asymmetrical wave sheets -----------------------------------------
    def wave_fn(th0, th1, Hmax, reach, curl, lean):
        def fn(u, v):
            th = lerp(th0, th1, u)
            env = math.sin(math.pi * u) ** 0.8
            wob = 0.85 + 0.15 * math.sin(7 * u * math.pi + ph[3])
            H = Hmax * env * wob
            r = RC + 0.3 + reach * env * v ** 1.2 + curl * env * v ** 3 + lean * v
            return (r * math.cos(th) * S, r * math.sin(th) * S, (v * H + 0.6) * S)
        return fn

    for name, args in (("LIQUID_WaveLeft", (math.radians(112), math.radians(208), 14.5, 4.2, 3.4, 0.4)),
                       ("LIQUID_WaveRight", (math.radians(-26), math.radians(62), 10.5, 3.2, 2.4, 0.3))):
        bm = parametric_sheet(48, 24, wave_fn(*args), False)
        o = bm_to_object(bm, name, liq, root)
        set_material(o, mats["liquid"])
        add_modifier(o, "SOLIDIFY", "Thickness", thickness=0.0010, offset=0)
        add_modifier(o, "SUBSURF", "Smooth", levels=1, render_levels=2)

    # ---- tendrils -------------------------------------------------------------------
    def in_front_zone(x, y, z):
        return y < 0 and abs(x) < 4.4 and z < 15.8

    tendril_count = 0
    tries = 0
    tips = []
    while tendril_count < 9 and tries < 200:
        tries += 1
        th0 = rng.uniform(FRONT + 0.95, FRONT + 2 * math.pi - 0.95)
        r0, z0 = RC + 0.8, 1.0
        reach = rng.uniform(3.5, 8.0)
        zp = rng.uniform(8.0, 18.0)
        swirl = rng.uniform(-0.55, 0.55)
        pts = []
        ok = True
        N = 16
        for k in range(N):
            t = k / (N - 1)
            th = th0 + swirl * t * t
            r = r0 + reach * (t ** 0.9)
            z = z0 + (zp - z0) * math.sin(t * math.pi / 2) ** 1.1
            x, y = r * math.cos(th), r * math.sin(th)
            if in_front_zone(x, y, z):
                ok = False
                break
            pts.append((x, y, z, t))
        if not ok:
            continue
        cu = bpy.data.curves.new("LIQUID_Tendril_%02d" % tendril_count, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 1.0
        cu.bevel_resolution = 3
        cu.resolution_u = 6
        safe_set(cu, use_fill_caps=True)
        sp = cu.splines.new("NURBS")
        sp.points.add(N - 1)
        base_r = rng.uniform(0.38, 0.6)
        for p, (x, y, z, t) in zip(sp.points, pts):
            p.co = (x * S, y * S, z * S, 1.0)
            p.radius = base_r * (1.0 - 0.55 * t ** 1.5) * S
        sp.order_u = 4
        sp.use_endpoint_u = True
        ob = link(bpy.data.objects.new("LIQUID_Tendril_%02d" % tendril_count, cu), liq, root)
        cu.materials.append(mats["liquid"])
        tips.append((pts[-1][0], pts[-1][1], pts[-1][2], base_r * 0.75))
        tendril_count += 1

    # ---- droplets: tendril bulbs + crown tips + airborne cloud ------------------
    bm = bmesh.new()
    for (x, y, z, r) in tips:
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r,
                                   matrix=Matrix.Translation((x, y, z + r * 0.4)) @
                                          Matrix.Diagonal((1, 1, 1.2, 1)))
    for i in range(160):
        th = 2 * math.pi * i / 160
        if front_weight(th) < 0.35:
            continue
        n = 0.5 * math.sin(5 * th + ph[0]) + 0.3 * math.sin(9 * th + ph[1]) + 0.2 * math.sin(13 * th + ph[2])
        n_prev = 0.5 * math.sin(5 * (th - 0.04) + ph[0]) + 0.3 * math.sin(9 * (th - 0.04) + ph[1]) + 0.2 * math.sin(13 * (th - 0.04) + ph[2])
        n_next = 0.5 * math.sin(5 * (th + 0.04) + ph[0]) + 0.3 * math.sin(9 * (th + 0.04) + ph[1]) + 0.2 * math.sin(13 * (th + 0.04) + ph[2])
        if n > n_prev and n > n_next and n > 0.35:
            w = front_weight(th)
            H = 1.2 + w * (3.2 + 3.8 * (0.5 + 0.5 * n) + 2.6 * max(0, n) ** 1.5)
            r = RC + 0.7 + 2.4 * w + 0.35 + 1.1 * w
            rr = rng.uniform(0.28, 0.48)
            bmesh.ops.create_icosphere(bm, subdivisions=3, radius=rr,
                                       matrix=Matrix.Translation((r * math.cos(th), r * math.sin(th), H + rr * 0.9)))
    near = bm_to_object(bm, "LIQUID_Droplets_Attached", liq, root)
    set_material(near, mats["liquid"])

    bm = bmesh.new()
    placed = []
    attempts = 0
    while len(placed) < 85 and attempts < 4000:
        attempts += 1
        th = rng.uniform(0, 2 * math.pi)
        rho = 4.8 + rng.random() ** 1.6 * 9.0
        z = rng.uniform(3.5, 19.0)
        x, y = rho * math.cos(th), rho * math.sin(th)
        if in_front_zone(x, y, z):
            continue
        r = min(0.55, max(0.07, rng.lognormvariate(math.log(0.16), 0.55)))
        if any(math.dist((x, y, z), (px, py, pz)) < r + pr + 0.25 for (px, py, pz, pr) in placed):
            continue
        placed.append((x, y, z, r))
        stretch = 1.0 + rng.uniform(0.0, 0.25) * (1 if r < 0.3 else 0.4)
        bmesh.ops.create_icosphere(bm, subdivisions=2 if r < 0.2 else 3, radius=r,
                                   matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, 1, stretch, 1)))
    air = bm_to_object(bm, "LIQUID_Droplets_Airborne", liq, root)
    set_material(air, mats["liquid"])

    # ---- puddle the can stands in --------------------------------------------------
    pool_prof = catmull([(0, 0.20), (6.0, 0.20), (8.2, 0.18), (9.0, 0.10), (9.2, 0.0)], 4)
    bm = revolve_bm(pool_prof, 128, flip=True)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        k = 1.0 + 0.10 * math.sin(3 * a + ph[0]) + 0.06 * math.sin(7 * a + ph[1]) + 0.03 * math.sin(11 * a + ph[2])
        v.co.x *= k if r > 5 else 1.0
        v.co.y *= k if r > 5 else 1.0
    pool = bm_to_object(bm, "LIQUID_Pool", liq, root)
    set_material(pool, mats["liquid"])
    return root, air


# ------------------------------- simulation (optional) -------------------------
def build_simulation(colls):
    """Mantaflow set-up. Created muted unless CONFIG['USE_FLUID_SIM'] is True. Bake manually."""
    sim = colls["SIMULATION"]
    on = CONFIG["USE_FLUID_SIM"]
    cache_dir = os.path.join(CONFIG["OUTPUT_DIR"], "fluid_cache")

    def box(name, size, loc):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        o = bm_to_object(bm, name, sim, scale=1.0, smooth=False)
        o.location = loc
        return o

    dom = box("SIM_Domain", (0.46, 0.46, 0.40), (0, 0, 0.19))
    dom.display_type = "WIRE"
    m = add_modifier(dom, "FLUID", "Fluid")
    if m:
        safe_set(m, fluid_type="DOMAIN")
        ds = m.domain_settings
        safe_set(ds, domain_type="LIQUID", resolution_max=96, use_mesh=True, cache_type="REPLAY",
                 cache_frame_start=s2f(2.0), cache_frame_end=s2f(8.0), use_adaptive_timesteps=True,
                 cache_directory=cache_dir)
        safe_set(m, show_viewport=on, show_render=on)

    flow = box("SIM_Flow_Emitter", (0.05, 0.05, 0.02), (0, 0.0, 0.012))
    flow.display_type = "WIRE"
    m = add_modifier(flow, "FLUID", "Fluid")
    if m:
        safe_set(m, fluid_type="FLOW")
        fs = m.flow_settings
        safe_set(fs, flow_type="LIQUID", flow_behavior="INFLOW", flow_source="MESH",
                 use_initial_velocity=True, velocity_factor=1.0, use_plane_init=False)
        safe_set(m, show_viewport=on, show_render=on)
        flow.scale = (1.0, 1.0, 1.0)

    col = box("SIM_Collider", (0.066, 0.066, 0.15), (0, 0, 0.075))
    col.display_type = "WIRE"
    m = add_modifier(col, "FLUID", "Fluid")
    if m:
        safe_set(m, fluid_type="EFFECTOR")
        safe_set(m.effector_settings, effector_type="COLLISION", use_effector=True)
        safe_set(m, show_viewport=on, show_render=on)

    for o in (dom, flow, col):
        o.hide_render = not on
        o.hide_viewport = not on


# =============================================================================
# Materials
# =============================================================================
ALIASES = {
    "transmission": ["Transmission Weight", "Transmission"],
    "coat": ["Coat Weight", "Clearcoat"],
    "coat_rough": ["Coat Roughness", "Clearcoat Roughness"],
    "spec": ["Specular IOR Level", "Specular"],
    "emission": ["Emission Color", "Emission"],
    "base": ["Base Color"],
}


def set_in(node, key, value):
    for name in ALIASES.get(key, [key]):
        sock = node.inputs.get(name)
        if sock is not None:
            try:
                sock.default_value = value
            except (TypeError, ValueError):
                pass
            return True
    return False


def new_mat(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (900, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (600, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nt, bsdf, out


def lnk(nt, a, b):
    nt.links.new(a, b)


def make_mix(nt):
    """Colour-mix node working across versions. Returns (node, fac, a, b, out)."""
    try:
        n = nt.nodes.new("ShaderNodeMixRGB")
        n.blend_type = "MIX"
        return n, n.inputs[0], n.inputs[1], n.inputs[2], n.outputs[0]
    except RuntimeError:
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        return n, n.inputs[0], n.inputs[6], n.inputs[7], n.outputs[2]


def ramp(nt, stops, interp="LINEAR"):
    n = nt.nodes.new("ShaderNodeValToRGB")
    n.color_ramp.interpolation = interp
    cr = n.color_ramp
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, (pos, col) in zip(cr.elements, stops):
        el.position = pos
        el.color = col
    return n


def aluminium(name, base=(0.91, 0.92, 0.93, 1), rough=0.26, stretch=None, bump=0.03, noise_scale=320):
    mat, nt, bsdf, out = new_mat(name)
    set_in(bsdf, "base", base)
    set_in(bsdf, "Metallic", 1.0)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    src = tc.outputs["Object"]
    if stretch:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = stretch
        lnk(nt, src, mp.inputs["Vector"])
        src = mp.outputs["Vector"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 6
    lnk(nt, src, noise.inputs["Vector"])
    rng_ = nt.nodes.new("ShaderNodeMapRange")
    rng_.inputs["To Min"].default_value = rough - 0.07
    rng_.inputs["To Max"].default_value = rough + 0.07
    lnk(nt, noise.outputs["Fac"], rng_.inputs["Value"])
    lnk(nt, rng_.outputs["Result"], bsdf.inputs["Roughness"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.0005
    lnk(nt, noise.outputs["Fac"], bp.inputs["Height"])
    lnk(nt, bp.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def glass(name, tint=(1, 1, 1, 1), rough=0.0, absorb=None):
    mat, nt, bsdf, out = new_mat(name)
    set_in(bsdf, "base", tint)
    set_in(bsdf, "Metallic", 0.0)
    set_in(bsdf, "Roughness", rough)
    set_in(bsdf, "IOR", 1.333)
    set_in(bsdf, "transmission", 1.0)
    set_in(bsdf, "spec", 0.5)
    if absorb:
        vol = nt.nodes.new("ShaderNodeVolumeAbsorption")
        vol.inputs["Color"].default_value = absorb[0]
        vol.inputs["Density"].default_value = absorb[1]
        lnk(nt, vol.outputs["Volume"], out.inputs["Volume"])
    # Eevee-only knobs, silently ignored elsewhere
    for attr, val in (("blend_method", "BLEND"), ("use_screen_refraction", True), ("use_raytrace_refraction", True)):
        try:
            setattr(mat, attr, val)
        except (AttributeError, TypeError):
            pass
    return mat


def print_mat(name, color, rough=0.35, metallic=0.2, coat=0.25):
    mat, nt, bsdf, out = new_mat(name)
    set_in(bsdf, "base", color)
    set_in(bsdf, "Metallic", metallic)
    set_in(bsdf, "Roughness", rough)
    set_in(bsdf, "coat", coat)
    set_in(bsdf, "coat_rough", 0.15)
    return mat


def label_mat():
    mat, nt, bsdf, out = new_mat("MAT_LabelPrint")
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    lnk(nt, uv.outputs["UV"], sep.inputs["Vector"])
    grad = ramp(nt, [(0.0, (0.002, 0.040, 0.052, 1)), (0.35, (0.004, 0.19, 0.15, 1)),
                     (0.62, (0.008, 0.36, 0.17, 1)), (1.0, (0.20, 0.55, 0.05, 1))])
    lnk(nt, sep.outputs["Y"], grad.inputs["Fac"])
    # ribbons only on the top and bottom bands so they never sit behind the type
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.inputs["Scale"].default_value = 5.0
    wave.inputs["Distortion"].default_value = 4.5
    wave.inputs["Detail"].default_value = 1.0
    lnk(nt, uv.outputs["UV"], wave.inputs["Vector"])
    stripe = ramp(nt, [(0.0, (0, 0, 0, 1)), (0.80, (1, 1, 1, 1))], "CONSTANT")
    lnk(nt, wave.outputs["Fac"], stripe.inputs["Fac"])
    mask = ramp(nt, [(0.0, (1, 1, 1, 1)), (0.17, (0, 0, 0, 1)), (0.92, (1, 1, 1, 1))], "CONSTANT")
    lnk(nt, sep.outputs["Y"], mask.inputs["Fac"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    lnk(nt, stripe.outputs["Color"], mul.inputs[0])
    lnk(nt, mask.outputs["Color"], mul.inputs[1])
    node, fac, a, b, res = make_mix(nt)
    lnk(nt, mul.outputs["Value"], fac)
    lnk(nt, grad.outputs["Color"], a)
    b.default_value = (0.45, 0.62, 0.03, 1)
    lnk(nt, res, bsdf.inputs["Base Color"])
    set_in(bsdf, "Metallic", 0.35)
    set_in(bsdf, "Roughness", 0.30)
    set_in(bsdf, "coat", 0.35)
    set_in(bsdf, "coat_rough", 0.12)
    return mat


def make_materials():
    m = {}
    m["body"] = aluminium("MAT_Aluminium_Body", rough=0.24)
    m["rim"] = aluminium("MAT_Aluminium_Rim", rough=0.20, bump=0.01)
    m["lid"] = aluminium("MAT_Aluminium_Lid", rough=0.30, stretch=(900, 6, 6), bump=0.05, noise_scale=140)
    m["tab"] = aluminium("MAT_Aluminium_Tab", base=(0.80, 0.82, 0.85, 1), rough=0.28, bump=0.02)
    m["aperture"] = aluminium("MAT_Aperture", base=(0.35, 0.37, 0.39, 1), rough=0.45, bump=0.01)
    m["label"] = label_mat()
    m["t_brand"] = print_mat("MAT_Print_Brand", (0.80, 0.90, 0.12, 1), 0.28, 0.25, 0.3)
    m["t_flavor"] = print_mat("MAT_Print_Flavor", (0.95, 0.97, 0.90, 1), 0.32, 0.1, 0.25)
    m["t_white"] = print_mat("MAT_Print_White", (0.90, 0.93, 0.90, 1), 0.34, 0.1, 0.25)
    m["t_logo"] = print_mat("MAT_Print_Logo", (0.95, 0.30, 0.02, 1), 0.30, 0.15, 0.3)
    m["drops"] = glass("MAT_Condensation", (0.97, 1.0, 1.0, 1), 0.0)
    m["liquid"] = glass("MAT_Liquid", (0.90, 1.0, 0.95, 1), 0.015, absorb=((0.70, 0.95, 0.80, 1), 14.0))
    return m


# =============================================================================
# Environment, lighting, cameras
# =============================================================================
def build_environment(colls):
    env = colls["ENVIRONMENT"]
    pts = [(-2.2, 0.0), (0.55, 0.0)]
    for k in range(1, 21):
        a = (math.pi / 2) * k / 20
        pts.append((0.55 + 0.55 * math.sin(a), 0.55 - 0.55 * math.cos(a)))
    pts.append((1.10, 3.0))
    bm = bmesh.new()
    xs = [-2.4, 0.0, 2.4]
    rows = [[bm.verts.new((x, y, z)) for (y, z) in pts] for x in xs]
    for i in range(len(xs) - 1):
        for k in range(len(pts) - 1):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    o = bm_to_object(bm, "ENV_Cyclorama", env, scale=1.0)

    mat, nt, bsdf, out = new_mat("MAT_Cyclorama")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    lnk(nt, tc.outputs["Object"], sep.inputs["Vector"])
    g = ramp(nt, [(0.0, (0.004, 0.050, 0.060, 1)), (0.35, (0.006, 0.090, 0.095, 1)),
                  (1.0, (0.004, 0.030, 0.040, 1))])
    lnk(nt, sep.outputs["Z"], g.inputs["Fac"])
    lnk(nt, g.outputs["Color"], bsdf.inputs["Base Color"])
    set_in(bsdf, "Roughness", 0.30)
    set_in(bsdf, "spec", 0.5)
    set_in(bsdf, "coat", 0.0)
    o.data.materials.append(mat)

    # world: nearly black so the lights, not the HDRI, shape the product
    world = bpy.data.worlds.new("ZESTA_World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.004, 0.012, 0.014, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world


def build_lighting(colls):
    lc = colls["LIGHTING"]
    ls = CONFIG["LIGHT_SCALE"]
    target = link(bpy.data.objects.new("LIGHT_Target", None), lc)
    target.location = (0, 0, 0.078)
    bgt = link(bpy.data.objects.new("LIGHT_BGTarget", None), lc)
    bgt.location = (0, 1.0, 0.25)
    made = {}

    def area(name, loc, sx, sy, watts, color=(1, 1, 1), aim=target, kind="AREA"):
        ld = bpy.data.lights.new(name, kind)
        ld.color = color
        ld.energy = watts * ls
        if kind == "AREA":
            ld.shape = "RECTANGLE"
            ld.size = sx
            ld.size_y = sy
        else:
            ld.spot_size = math.radians(sx)
            ld.spot_blend = 1.0
        ob = link(bpy.data.objects.new(name, ld), lc)
        ob.location = loc
        c = ob.constraints.new("TRACK_TO")
        c.target = aim
        c.track_axis = "TRACK_NEGATIVE_Z"
        c.up_axis = "UP_Y"
        safe_set(ob, visible_camera=False)
        made[name] = ld
        return ld

    area("LIGHT_Key_Softbox", (-0.85, -0.85, 0.55), 0.8, 0.8, 320, (1.0, 0.97, 0.93))
    area("LIGHT_Strip_RimLeft", (-0.55, 0.40, 0.11), 0.10, 0.75, 220, (0.85, 0.95, 1.0))
    area("LIGHT_Strip_RimRight", (0.55, 0.40, 0.11), 0.10, 0.75, 220, (0.85, 1.0, 0.95))
    area("LIGHT_Strip_FrontRight", (0.55, -0.60, 0.11), 0.07, 0.65, 150, (1.0, 1.0, 1.0))
    area("LIGHT_Back_Splash", (0.0, 0.50, 0.17), 0.60, 0.45, 520, (0.80, 1.0, 0.90))
    area("LIGHT_Top_Sheet", (0.0, -0.20, 0.75), 0.60, 0.30, 90, (1, 1, 1))
    area("LIGHT_Fill", (0.80, -0.90, 0.10), 0.9, 0.9, 40, (0.85, 0.92, 1.0))
    area("LIGHT_Accent_SplashL", (-0.33, -0.30, 0.24), 0.14, 0.14, 70, (1, 0.95, 0.85))
    area("LIGHT_Accent_SplashR", (0.33, -0.28, 0.22), 0.14, 0.14, 70, (0.85, 1.0, 0.95))
    area("LIGHT_BG_Glow", (0.0, 0.30, 0.10), 80, 0, 220, (0.15, 0.85, 0.65), aim=bgt, kind="SPOT")
    return made


def build_cameras(colls):
    cc = colls["CAMERAS"]
    tgt = link(bpy.data.objects.new("CAM_Target", None), cc)
    tgt.location = (0, 0, 0.088)
    focus = link(bpy.data.objects.new("CAM_FocusPoint", None), cc)
    focus.location = (0, -0.0335, 0.078)

    def cam(name, lens, loc, fit="HORIZONTAL", fstop=5.6, shift=(0, 0), aim=tgt):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        cd.sensor_fit = fit
        cd.sensor_width = 36
        cd.clip_start = 0.01
        cd.clip_end = 20
        cd.shift_x, cd.shift_y = shift
        cd.dof.use_dof = True
        cd.dof.focus_object = focus
        cd.dof.aperture_fstop = fstop
        ob = link(bpy.data.objects.new(name, cd), cc)
        ob.location = loc
        c = ob.constraints.new("TRACK_TO")
        c.target = aim
        c.track_axis = "TRACK_NEGATIVE_Z"
        c.up_axis = "UP_Y"
        return ob

    hero = cam("CAM_Hero", 70, (0.22, -1.35, 0.20), shift=(0.09, -0.005))
    vert = cam("CAM_Hero_Vertical", 70, (0.20, -1.55, 0.26), fit="VERTICAL", shift=(0.0, -0.01))
    det_tgt = link(bpy.data.objects.new("CAM_DetailTarget", None), cc)
    det_tgt.location = (0, -0.01, 0.105)
    det = cam("CAM_Detail", 100, (0.10, -0.50, 0.135), fstop=4.0, aim=det_tgt)
    return hero, vert, det, tgt


# =============================================================================
# Animation
# =============================================================================
def key(idb, path, frame, value, index=-1):
    setattr_path(idb, path, value)
    idb.keyframe_insert(data_path=path, frame=frame, index=index)


def setattr_path(idb, path, value):
    setattr(idb, path, value)


def beautify_curves(idb):
    """Make every keyframe Bezier with auto-clamped handles (best-effort across versions)."""
    ad = getattr(idb, "animation_data", None)
    if not ad or not ad.action:
        return
    fcs = []
    try:
        fcs = list(ad.action.fcurves)
    except AttributeError:
        try:
            for layer in ad.action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        fcs.extend(bag.fcurves)
        except AttributeError:
            return
    for fc in fcs:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"


def animate(root, liq_root, air, hero, vert, det, tgt, lights):
    rad = math.radians
    sc = scene
    sc.frame_start, sc.frame_end, sc.render.fps = 1, END_FRAME, FPS

    # can: slow rotate into hero position, label faces camera (rot z = 0) at HERO_SEC
    for t, deg in ((0.0, -165), (2.0, -128), (4.0, -62), (6.0, -14), (CONFIG["HERO_SEC"], 0), (CONFIG["DURATION_SEC"], 0)):
        root.rotation_euler = (0, 0, rad(deg))
        root.keyframe_insert("rotation_euler", frame=s2f(t))

    # splash: grows from the base, then settles
    for t, k in ((0.0, 0.001), (2.2, 0.001), (3.2, 0.30), (4.6, 0.62), (6.4, 0.96), (CONFIG["HERO_SEC"], 1.0),
                 (CONFIG["DURATION_SEC"], 1.015)):
        liq_root.scale = (k, k, k)
        liq_root.keyframe_insert("scale", frame=s2f(t))
    for t, dz in ((4.0, -0.03), (6.5, 0.006), (CONFIG["HERO_SEC"], 0.0), (CONFIG["DURATION_SEC"], 0.004)):
        air.location = (0, 0, dz)
        air.keyframe_insert("location", frame=s2f(t))

    # cameras (restrained dolly + orbit, long settle)
    D = CONFIG["DURATION_SEC"]
    for t, loc, tz in ((0.0, (0.22, -1.35, 0.20), 0.092), (4.0, (0.11, -1.17, 0.175), 0.088),
                       (CONFIG["HERO_SEC"], (0.0, -1.02, 0.158), 0.081), (D, (0.0, -1.00, 0.156), 0.081)):
        hero.location = loc
        hero.keyframe_insert("location", frame=s2f(t))
        vert.location = (loc[0] * 0.9, loc[1] * 1.15, loc[2] * 1.3)
        vert.keyframe_insert("location", frame=s2f(t))
        tgt.location = (0, 0, tz)
        tgt.keyframe_insert("location", frame=s2f(t))
    det.location = (0.10, -0.50, 0.135)

    # lights fade up while the camera reveals the can
    for name, ld in lights.items():
        full = ld.energy
        for t, k in ((0.0, 0.05), (1.0, 0.45), (2.4, 1.0)):
            ld.energy = full * k
            ld.keyframe_insert("energy", frame=s2f(t))
        ld.energy = full
        beautify_curves(ld)

    for o in (root, liq_root, air, hero, vert, tgt):
        beautify_curves(o)
    # single-key objects need no curves; detail camera is static


# =============================================================================
# Render / output settings
# =============================================================================
def configure_render():
    r = scene.render
    r.fps = FPS
    final = CONFIG["QUALITY"] == "FINAL"
    if CONFIG["VERTICAL"]:
        r.resolution_x, r.resolution_y = 1080, 1920
        scene.camera = bpy.data.objects["CAM_Hero_Vertical"]
    else:
        r.resolution_x, r.resolution_y = 1920, 1080
        scene.camera = bpy.data.objects["CAM_Hero"]
    r.resolution_percentage = 100 if final else 50
    r.use_motion_blur = True
    safe_set(r, motion_blur_shutter=0.4)

    engines = [e.identifier for e in r.bl_rna.properties["engine"].enum_items]
    if CONFIG["ENGINE"] == "CYCLES" and "CYCLES" in engines:
        r.engine = "CYCLES"
        cy = scene.cycles
        cy.samples = 512 if final else 48
        safe_set(cy, use_adaptive_sampling=True, adaptive_threshold=0.01, use_denoising=True,
                 denoiser="OPENIMAGEDENOISE", max_bounces=12, transmission_bounces=12,
                 glossy_bounces=8, transparent_max_bounces=12, caustics_reflective=False,
                 caustics_refractive=False, sample_clamp_indirect=10.0)
        # GPU if one is available, else CPU
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for dtype in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
                try:
                    prefs.compute_device_type = dtype
                except (TypeError, ValueError):
                    continue
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type != "CPU"]
                if gpus:
                    for d in gpus:
                        d.use = True
                    cy.device = "GPU"
                    info("Cycles GPU: %s (%s)" % (dtype, ", ".join(d.name for d in gpus)))
                    break
        except Exception as e:  # noqa: BLE001 - hardware probing is best-effort
            warn("GPU probe skipped: %s" % e)
    else:
        for ident in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            if ident in engines:
                r.engine = ident
                break
        ee = scene.eevee
        safe_set(ee, taa_render_samples=128 if final else 32)
        for attr in ("use_raytracing", "use_gtao", "use_ssr", "use_ssr_refraction", "use_soft_shadows"):
            if hasattr(ee, attr):          # names differ between Eevee generations
                setattr(ee, attr, True)
        if CONFIG["ENGINE"] == "CYCLES":
            warn("Cycles not available - using Eevee")

    vs = scene.view_settings
    for transform in ("AgX", "Filmic"):
        try:
            vs.view_transform = transform
            break
        except TypeError:
            continue
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "None"):
        try:
            vs.look = look
            break
        except TypeError:
            continue
    vs.exposure = 0.0
    safe_set(scene.display_settings, display_device="sRGB")

    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "CENTIMETERS"

    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "16" if final else "8"
    r.filepath = os.path.join(CONFIG["OUTPUT_DIR"], "frames", "zesta_")


def setup_video_output():
    r = scene.render
    try:
        safe_set(r.image_settings, media_type="VIDEO")
    except Exception:  # noqa: BLE001
        pass
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "MPEG4"
    r.ffmpeg.codec = "H264"
    safe_set(r.ffmpeg, constant_rate_factor="HIGH", ffmpeg_preset="GOOD")


# =============================================================================
# Preview / final render helpers  (callable from Blender's Python console)
# =============================================================================
def render_preview_still(path=None):
    path = path or os.path.join(CONFIG["OUTPUT_DIR"], "zesta_preview.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.frame_set(HERO_FRAME)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    ok = os.path.exists(path)
    info(("Preview still written: " + path) if ok else "Preview still FAILED - no file at " + path)
    return ok


def render_animation(path=None):
    path = path or os.path.join(CONFIG["OUTPUT_DIR"], "zesta_ad")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    setup_video_output()
    scene.render.filepath = path
    bpy.ops.render.render(animation=True)
    info("Animation render finished (check %s*.mp4)" % path)


# =============================================================================
# Main
# =============================================================================
def main():
    os.makedirs(CONFIG["OUTPUT_DIR"], exist_ok=True)
    clear_previous()
    colls = make_collections()
    mats = make_materials()

    root = build_can(colls, mats)
    build_label(colls, mats, root)
    if CONFIG["CONDENSATION"]:
        build_condensation(colls, mats, root)
    liq_root, air = build_liquid(colls, mats)
    build_simulation(colls)
    build_environment(colls)
    lights = build_lighting(colls)
    hero, vert, det, tgt = build_cameras(colls)
    animate(root, liq_root, air, hero, vert, det, tgt, lights)
    configure_render()
    scene.frame_set(HERO_FRAME)

    saved = False
    if CONFIG["SAVE_BLEND"]:
        path = os.path.join(CONFIG["OUTPUT_DIR"], CONFIG["BLEND_NAME"])
        try:
            bpy.ops.wm.save_as_mainfile(filepath=path)
            saved = os.path.exists(path)
        except RuntimeError as e:
            warn("save failed: %s" % e)
        info(("Saved: " + path) if saved else "NOT saved (see warnings above)")

    if CONFIG["RENDER_STILL"]:
        render_preview_still()
    if CONFIG["RENDER_ANIMATION"]:
        render_animation()

    info("Scene built. Frames 1-%d @ %d fps, hero frame %d." % (END_FRAME, FPS, HERO_FRAME))
    info("Preview: Cycles/Eevee viewport in Rendered mode, or call render_preview_still().")
    info("Final: set CONFIG QUALITY='FINAL' (re-run) then Render > Render Animation, or "
         "render_animation().")


main()
