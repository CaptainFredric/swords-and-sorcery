// Every siege machine may report hull or component repair without an authored
// locator. The ward's health restoration is server-owned; this only locates the
// visual confirmation of an already-authoritative positive repair event.
export function siegeSteelRepairPoint(event,machine,componentPoint=null){
 if(componentPoint)return componentPoint;
 if(event?.point)return event.point;
 if(!machine||!(machine.health>0)||
   !Number.isFinite(machine.x)||!Number.isFinite(machine.z))return null;
 return {x:machine.x,y:(machine.y??0)+.9,z:machine.z};
}
