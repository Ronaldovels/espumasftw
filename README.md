# Espumas — Campeonato Valorant

Site para organizar as composições do time em Abyss, Ascent, Haven, Summit, Split, Sunset, Lotus, Corrode e Bind. Cada mapa guarda os agentes de joao, ronaldo, bolla, rafa e felipe, procedimentos por fase, observações e resultados de treinos. Default, Exec por bomb, Pós Plant e Retake aparecem junto ao quadro tático da fase. O quadro salva automaticamente agentes, habilidades, desenhos e textos por mapa e fase.

Os minimapas, as posições e os ícones de habilidades do quadro tático são baixados com `node scripts/fetch-tactics-assets.mjs`. Os alcances ficam em `lib/tactics/abilities.ts` e são aproximados.

## Desenvolvimento

Requer Node.js 22.13 ou mais recente.

```sh
npm ci
npm run dev
```

O frontend e as rotas públicas rodam em Next.js na Vercel. A API privada roda no Render, com dados no Postgres do Neon, no schema `espumas`. As rotas Next.js encaminham as chamadas com `ESPUMAS_API_KEY`; o navegador não recebe a chave nem a URL do banco. A origem da API é definida por `ESPUMAS_DATA_ORIGIN`.

Para a API, rode `cd server && npm ci && npm start`. Configure `DATABASE_URL` (conexão pooled do Neon) e `ESPUMAS_API_KEY`. Antes da primeira execução, rode `npm run migrate` com `DATABASE_URL_UNPOOLED` (conexão direta). `server/scripts/import-sites.mjs` importa os dados do serviço anterior durante a migração. Não execute a importação depois que o time começar a editar os dados no Neon, pois ela sobrescreve os registros.

As Observações Gerais do Time usam um registro próprio no banco, acessado pela rota `/api/team-observations`. O texto é o mesmo em todos os mapas e tem limite de 5.000 caracteres.

## VLR dos Espumas

A página `/vlr-dos-espumas` mostra as séries do time com placares, agentes e leaderboards em HTML. As abas alternam entre a série inteira e cada mapa; as colunas permitem ordenação e o filtro permite ver uma equipe por vez. Cada partida tem um link permanente em `/vlr-dos-espumas/[matchId]`.

Os jogos competitivos de 13/10/2026 estão registrados como Buchas (Lotus, 13–9), Louças (Haven, 13–5) e Molhados (Abyss, 15–13), com escudos próprios. Partidas de um mapa exibem o placar em rounds; séries de vários mapas exibem vitórias por mapa. Os registros mantêm a data do Tracker, mesmo quando inseridos depois da meia-noite. A morte sem eliminação adversária de vls no round 23 da Abyss está documentada em `uncreditedDeaths`, sem alterar os números originais.

`/vlr-dos-espumas/jogadores` reúne os cinco jogadores. Cada perfil em `/vlr-dos-espumas/jogadores/[playerId]` mostra uso e estatísticas por agente, filtros de 30/60/90 dias e todo o histórico, além da lista de partidas por mapa. Os nomes dos placares levam aos perfis, inclusive dos adversários. A identidade `laszo` também reúne os jogos registrados com o nome `lsz`; não há duplicação por mudança de nick.

Os perfis usam a mesma função de agregação dos placares: rating bruto por mapa ponderado pelos rounds, piso e arredondamento apenas no final. ACS, ADR e KAST dos agentes também usam ponderação por rounds; K/D/A e FK/FD são somados. USE conta mapas, KPR é K/rounds, APR é A/rounds e FK:FD é a razão entre os totais. Denominadores zero mostram infinito quando há numerador positivo, ou um traço quando ambos são zero. HS não é consolidado sem contagens de acertos. A página explica que a amostra inclui somente o histórico registrado no site.

O primeiro registro é Espumas 3–0 Esponjas, de 07/10/2026, em Ascent, Split e Summit. As estatísticas foram conferidas nos três placares do Tracker, incluindo o ADR com uma casa decimal. O rating é calculado pela fórmula Espumas v1, calibrada com ratings VLR 2.0. HS% permanece separado por mapa, pois a contagem de acertos necessária para consolidá-lo não foi fornecida.

Para adicionar séries, crie um JSON em `data/vlr/` seguindo `lib/vlr/types.ts` e registre-o em `lib/vlr/matches.ts`. Registre médias gerais em `seriesStats` quando disponíveis para evitar diferenças de arredondamento; os totais de K/D/A e FK/FD são calculados pelos mapas. Não preencha ratings: o sistema calcula por mapa e pondera as contribuições sem arredondamento pelos rounds da série. `npm run vlr:validate` confere os dados, agentes, placares, totais e o cálculo do rating. As séries são versionadas no repositório e não dependem da API de composições.

### Rating Espumas v1

A fórmula é uma estimativa baseada nos totais do mapa, não uma reprodução do algoritmo privado do VLR. [Método, fórmula, validação e limitações](docs/rating.md). Ajuste em 880 registros de jogador por mapa (88 mapas do Champions 2025); teste separado em 530 registros (53 mapas de 23 séries concluídas do Champions 2026). Erro absoluto médio no teste: **0,0583 ponto**. Em **85,5%** dos casos, o erro foi de até **0,10 ponto**. Não há medição equivalente para partidas personalizadas, que não têm rating VLR oficial.

`npm run rating:calibrate` reproduz o ajuste offline usando os dados versionados; `npm run rating:check` confirma os coeficientes e o relatório sem modificar arquivos. A seleção de variáveis e regularização usa validação cruzada com cinco grupos de séries dentro de 2025. O evento de 2026 fica fora do ajuste. Nenhum dado de pesquisa nem acesso ao Tracker/VLR é necessário durante o uso do site.

As imagens dos mapas e ícones dos agentes vêm do [Valorant-API](https://valorant-api.com/), a partir de conteúdo do VALORANT. Este é um projeto independente, sem afiliação com a Riot Games ou com a FIAP.
