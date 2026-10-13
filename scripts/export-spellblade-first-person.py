"""Export/review the editable first person source without rebuilding the third person knight.
Blender --background --python this-file -- --out DIRECTORY --source-revision SHA40
"""
import argparse,hashlib,json,re,sys
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.blender.characters.spellblade.first_person import build_first_person_asset
from tools.blender.characters.spellblade.validate import load_contract
args=sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else[]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--source-revision',required=True);options=parser.parse_args(args)
if not re.fullmatch('[0-9a-f]{40}',options.source_revision):raise ValueError('Use a real 40 character source commit SHA')
options.out.mkdir(parents=True,exist_ok=True)
result=build_first_person_asset(options.out,load_contract(),'review')
source=ROOT/'tools/blender/characters/spellblade/source/spellblade-first-person.blend'
report={'schemaVersion':1,'reviewOnly':True,'sourceRevision':options.source_revision,'blenderVersion':bpy.app.version_string,
 'firstPersonSource':{'file':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},
 'firstPerson':{'triangles':result.triangles,'triangleBudget':result.triangle_budget,'animations':list(result.animations)},
 'sizes':{'firstPersonGlbBytes':result.glb_bytes,'firstPersonTargetBytes':result.target_bytes},
 'outputs':{'firstPersonGlb':result.glb.name,'firstPersonBlend':result.blend.name,'renders':{k:v.name for k,v in result.renders.items()}},
 'firstPersonGlbSha256':hashlib.sha256(result.glb.read_bytes()).hexdigest()}
(options.out/'spellblade-build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('FIRST_PERSON_AUTHORED_EXPORT_OK',result.triangles,result.glb_bytes)
