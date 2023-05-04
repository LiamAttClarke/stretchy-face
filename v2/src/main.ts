import ModelRenderer from './ModelRenderer';

const MODEL_PATH = "/assets/liam4.glb";

async function main() {
  const modelRenderer = new ModelRenderer({
    modelPath: MODEL_PATH,
    renderTarget: document.getElementById('renderTarget')!
  });

  await modelRenderer.initialize()

  modelRenderer.resume();
}

main();
