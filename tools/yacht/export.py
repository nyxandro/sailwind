"""Export the reviewed Boat-web-preview.blend as a game-aligned static hull.

Run Blender in background with --python export.py -- INPUT.blend OUTPUT.glb.
The source blend is read only; the output contains no source sails or animations.
"""
import bpy  # pyright: ignore[reportMissingImports]  # Provided by Blender's embedded Python.
import bmesh  # pyright: ignore[reportMissingImports]
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector  # pyright: ignore[reportMissingImports]

SCALE = 0.82
WATERLINE_LIFT = 0.65
FORE_AFT_OFFSET = 0.55
PAINT_LINE = 0.08

source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
if not source.is_file() or not output.parent.is_dir():
    raise RuntimeError('YACHT_EXPORT_PATH: Source file and output directory must exist')
bpy.ops.wm.open_mainfile(filepath=str(source))
required = {'Boat', 'Veil', 'Mast', 'Rope', 'Hélix n°1', 'Hélix n°2', 'Wheel n°1', 'Wheel n°2'}
missing = required - set(bpy.data.objects.keys())
if missing:
    raise RuntimeError(f'YACHT_EXPORT_SOURCE: Missing source parts: {sorted(missing)}')

# Rotate the bow to game -Z after glTF's Y-up conversion, preserving handedness.
transform = Matrix.Translation((0, FORE_AFT_OFFSET, WATERLINE_LIFT)) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(SCALE, 4)
for obj in list(bpy.data.objects):
    if obj.type != 'MESH' or obj.name in {'Veil', 'Mast', 'Rope', 'Hélix n°2'}:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if obj.parent or obj.modifiers:
        raise RuntimeError(f'YACHT_EXPORT_SOURCE: Unexpected parent or modifier on {obj.name}')
    obj.animation_data_clear()
    obj.data.transform(transform @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)

antifouling = bpy.data.materials.new('underwater-paint')
antifouling.diffuse_color = (0.008, 0.015, 0.022, 1)
bsdf = antifouling.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = antifouling.diffuse_color
bsdf.inputs['Roughness'].default_value = 0.64

hull = bpy.data.objects['Boat']
hull.name = 'yacht-hull'
hull.data.materials.append(antifouling)
bm = bmesh.new()
bm.from_mesh(hull.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                       plane_co=Vector((0, 0, PAINT_LINE)), plane_no=Vector((0, 0, 1)), dist=1e-6)
for face in bm.faces:
    face.material_index = 1 if face.calc_center_median().z < PAINT_LINE else 0
bm.to_mesh(hull.data)
bm.free()

def pivot_part(mesh, name, top=False):
    coords = [vertex.co for vertex in mesh.data.vertices]
    low = Vector([min(p[i] for p in coords) for i in range(3)])
    high = Vector([max(p[i] for p in coords) for i in range(3)])
    pivot = (low + high) / 2
    if top:
        pivot.z = high.z
    mesh.data.transform(Matrix.Translation(-pivot))
    group = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(group)
    group.location = pivot
    mesh.parent = group
    mesh.name = name + '-mesh'
    return group

rudders = bpy.data.objects['Hélix n°1']
for name, sign in [('rudder-port', -1), ('rudder-starboard', 1)]:
    bm = bmesh.new()
    bm.from_mesh(rudders.data)
    if any(min(v.co.x for v in face.verts) < 0 < max(v.co.x for v in face.verts) for face in bm.faces):
        raise RuntimeError('YACHT_EXPORT_RUDDERS: Rudder pair crosses its separation plane')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x * sign <= 0], context='VERTS')
    mesh_data = bpy.data.meshes.new(name)
    bm.to_mesh(mesh_data)
    bm.free()
    mesh_data.materials.append(antifouling)
    mesh = bpy.data.objects.new(name + '-mesh', mesh_data)
    bpy.context.scene.collection.objects.link(mesh)
    pivot_part(mesh, name, top=True)
bpy.data.objects.remove(rudders, do_unlink=True)

for old, new in [('Wheel n°1', 'helm-port'), ('Wheel n°2', 'helm-starboard')]:
    pivot_part(bpy.data.objects[old], new)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                          use_selection=True, export_cameras=False, export_lights=False,
                          export_animations=False)
triangles = 0
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
manifest = {'source': source.name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'blender': bpy.app.version_string, 'scale': SCALE, 'lift': WATERLINE_LIFT, 'fore_aft_offset': FORE_AFT_OFFSET,
            'triangles': triangles, 'bytes': output.stat().st_size,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
output.with_suffix('.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('YACHT_EXPORT', json.dumps(manifest))
