FROM node:lts-alpine as script

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY .devcontainer/init.sh /


RUN apk add --update git \
&& corepack enable \
&& corepack prepare pnpm@latest --activate \
&& pnpm config set store-dir /root/.local/share/pnpm/store \
&& chmod +x /init.sh

ENTRYPOINT [ "/init.sh" ]

WORKDIR /app