import { compileServiceComposition } from "../composition/compileServiceComposition.js";

export function checkAllEffectiveServiceStages(projectDir: string): void {
  compileServiceComposition("dev", projectDir, {validationMode:true});
  compileServiceComposition("dev", projectDir, {full:true, validationMode:true});
  compileServiceComposition("prod", projectDir, {validationMode:true});
  compileServiceComposition("test", projectDir, {validationMode:true});
  compileServiceComposition("e2e", projectDir, {validationMode:true});
}
