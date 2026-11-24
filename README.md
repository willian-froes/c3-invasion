# C3 Invasion

Cena 3D construída com HTML, CSS, JavaScript e [A-Frame](https://aframe.io/).

## Executar

1. Abra a pasta do projeto no VS Code.
2. Clique com o botão direito em `index.html` e selecione **Open with Live Server**.
3. A página exibirá uma cena inicial com um cubo, chão, iluminação e câmera.

O A-Frame 1.8.0 é carregado via CDN, portanto é necessária conexão com a internet.
Use um servidor HTTP local para permitir o carregamento dos modelos 3D.

## Controles

- **W, A, S, D** ou **setas**: mover a câmera.
- **Clique e arraste**: olhar ao redor.
- **Ctrl + Alt + I**: abrir o inspetor do A-Frame.

## Desenvolver a cena

Edite os elementos dentro de `<a-scene>` em `index.html`. A cena inicial usa um
cubo como referência visual. O modelo `assets/c3_external_area.glb` está disponível
para a montagem do cenário com o componente `gltf-model`.

Os arquivos HTML, CSS e JavaScript são formatados pelo Prettier ao salvar no VS Code.

Referência: [documentação do A-Frame](https://aframe.io/docs/1.8.0/).
