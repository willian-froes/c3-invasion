# C3 Invasion

Cena em primeira pessoa com terreno, colisões e arma controlada por marcador.
Feita com A-Frame 1.8.0 e MindAR 1.2.5, carregados via CDN.

## Executar

Abra `index.html` pelo **Live Server** no VS Code. É necessário acesso à internet
para carregar as bibliotecas. Para usar a câmera, abra por `localhost` no notebook
ou HTTPS no celular.

## Controles

- **WASD / setas**: caminhar.
- **Shift**: correr.
- **Espaço**: pular quando estiver no chão.
- **Clique na cena**: capturar o mouse para olhar ao redor; **Esc** libera o cursor.

A movimentação usa gravidade e colisões com a geometria de `c3_external_area.glb`.
Ao cair para fora do terreno, o jogador volta ao ponto inicial.

## Arma

Clique em **Ativar câmera** e mostre `assets/target.webp` à webcam ou câmera do
celular. A arma acompanha a posição, distância e inclinação do marcador. Por
padrão, aponta para a frente quando a imagem está de frente para a câmera.
Ao perder o marcador por 0,8 s, a arma desaparece.

O painel permite selecionar a câmera, informar a largura impressa do marcador
(padrão: 10 cm) e ajustar a escala da arma (padrão: 0,7). Para a peça impressa em
3D, mantenha o marcador plano e visível na parte de cima. O encaixe precisa ser
conferido no dispositivo real.

Em `js/marker-weapon.js`, `mountPoint` define o ponto de montagem no modelo,
`mountRotation` ajusta a orientação e `smoothing` controla a suavização. Os valores
também podem ser sobrescritos no atributo `marker-weapon` da cena.

Os frames são processados localmente. **Desligar câmera** ou ocultar a aba encerra
a captura. Se trocar a imagem, recompile `assets/target.mind` com um único alvo no
[compilador do MindAR](https://hiukim.github.io/mind-ar-js-doc/tools/compile/).

## Estrutura

- `index.html`: terreno, iluminação, jogador, arma e painel de câmera.
- `css/ar-controls.css`: painel e instruções de movimento.
- `js/first-person-controls.js`: caminhar, correr, pular, gravidade e colisões.
- `js/marker-weapon.js`: captura da câmera, reconhecimento e pose da arma.
- `js/vendor/`: Octree e Capsule do Three.js r184, com licença MIT.
- `assets/`: terreno, arma e marcador.
- `tests/`: testes de movimentação, colisão e rastreamento.

Ajuste velocidade, altura, pulo e ponto inicial no componente
`first-person-controls` da entidade `#player`.

## Testar

O site funciona pelo Live Server sem instalar pacotes. Para os testes:

```sh
npm install
npx playwright install chromium
npm test
```

Os testes iniciam um servidor local e verificam movimentação, colisões e a arma.
O reconhecimento usa o MindAR real com vídeo simulado de `target.webp`, sem
acessar a webcam física. Requer internet para carregar as bibliotecas.
