# Editable ram source

`SoFist-crafted.blend` contains the isolated ram scene, geometry, packed material images and four authored actions. Other open Blender scenes are preserved by the export helper.

In Blender's Python console:

```python
RAM_REPO = '/absolute/path/to/swords-and-sorcery'
exec(open(RAM_REPO + '/tools/assets/export-so-fist.py').read())
```

Set `RAM_OUTPUT` to export a comparison file elsewhere. The default output is the runtime GLB. The helper checks the hierarchy and clip count and normalizes Blender duplicate name suffixes. After an intentional source edit, verify the wheel fit, update the manifest/hash and inspect the game before accepting an export.

The original asset is preserved in Git at the manifest's rollback commit. Refinement source retains the authored mechanisms and adds straight load rails, bindings, material regions, round running rims and front steering clearance. Full evidence is in `docs/evidence/so-fist-refinement`.
