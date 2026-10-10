# Vsl Watcher Heart

Quero criar uma plataforma SaaS focada principalmente em ANALYTICS DE VSL, inspirada na parte de métricas da VTurb.

IMPORTANTE: não quero desenvolver uma plataforma completa de hospedagem de vídeos neste momento. O objetivo principal é medir e analisar o comportamento dos espectadores durante a reprodução de uma VSL.

Infraestrutura

Utilize o Supabase para banco de dados, autenticação, armazenamento dos eventos e Edge Functions. O frontend deve ser construído com uma interface moderna, profissional e responsiva.

Minha VSL atual

Utilize esta VSL como primeiro exemplo real:

Vídeo:
https://lrlgziuwdmyklpfedtvp.supabase.co/storage/v1/object/public/vsls/original%20(2).mp4

Thumbnail:
https://lrlgziuwdmyklpfedtvp.supabase.co/storage/v1/object/public/vsls/6aa5f20fcca0875e43bf2fd5.png

Checkout:
https://pay.hotmart.com/J107685948G?off=6ka91kv3&checkoutMode=10

O player já possui uma oferta que aparece em 01:01:45. Quero registrar os eventos desse player para gerar métricas reais.

Funcionalidades principais

Dashboard geral com visualizações, reproduções iniciadas, tempo médio assistido, retenção média e cliques no checkout.

Gráfico de retenção detalhado, mostrando a porcentagem de espectadores que continua assistindo em cada segundo ou intervalo do vídeo.

Identificação dos momentos de maior abandono e dos trechos em que a retenção melhora ou cai significativamente.

Métricas de retenção em 10%, 25%, 50%, 75% e 100% da duração do vídeo.

Rastreamento de play, pausa, retomada, avanço, retorno, abandono, chegada ao CTA e clique no checkout.

Funil de conversão: reprodução iniciada → chegada à oferta → clique no checkout.

Filtros por período, vídeo e identificador de campanha, quando disponível.

Biblioteca simples para cadastrar diferentes VSLs e consultar as métricas individualmente.

Sistema de incorporação do player em páginas externas, com identificação do vídeo e envio dos eventos para o Supabase.

Como as métricas devem funcionar

Crie uma coleta de eventos confiável, evitando duplicar visualizações e contando corretamente espectadores e sessões. Registre a posição do vídeo no momento de cada evento e calcule a retenção a partir das sessões que efetivamente alcançaram cada trecho.

Diferencie tempo de reprodução de tempo pausado. Não conte uma pessoa como tendo assistido a um trecho apenas porque o vídeo avançou artificialmente até ele. Considere que usuários podem pular partes, voltar e recarregar a página.

O dashboard deve mostrar dados reais recebidos do player. Não use números fictícios para simular resultados.

Design

Quero uma interface de analytics profissional, com gráficos claros, cards de indicadores e visualização detalhada da retenção. Priorize a facilidade de identificar problemas na VSL e tomar decisões para melhorar sua conversão.

Ordem de implementação

Primeiro, conecte o Supabase e crie a estrutura de eventos. Depois, integre minha VSL atual, valide a coleta dos dados e só então construa os gráficos e indicadores com dados reais.

Não crie funcionalidades desnecessárias de hospedagem, edição de vídeo ou processamento avançado. O foco é analytics e retenção de VSL.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://vsl-watcher-heart.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e6df96b4-0fca-5890-a5de-cb24d17ac79d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
