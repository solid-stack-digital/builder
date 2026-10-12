import fs from 'node:fs';
import { expect,it } from 'vitest';
// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A14: schema preserves mesh service-name constraints',()=>{
 const root=JSON.parse(fs.readFileSync('schemas/mesh-schema.json','utf8')).definitions.MeshJsonV2;
 expect(root.properties.services.propertyNames).toBeDefined();
 expect(JSON.stringify(root.properties.services.propertyNames)).toContain('^[a-z][a-z0-9-]*$');
 expect(JSON.stringify(root.properties.services.propertyNames)).toContain('tester');
 for(const object of [root,...['dev','prod','test','e2e'].map(stage=>root.properties[stage])]){
  const services=object.properties.services;
  expect(services.propertyNames).toEqual(root.properties.services.propertyNames);
  expect(services.additionalProperties.properties.dependencies.additionalProperties).toEqual(services.propertyNames);
  expect(services.additionalProperties.properties.dependsOn.items).toEqual(services.propertyNames);
 }
});
