import type { NodeWithPos, PasteRuleMatch } from '@tiptap/core'
import {
  Mark,
  markPasteRule,
  mergeAttributes,
  getAttributes,
  combineTransactionSteps,
  findChildrenInRange,
  getChangedRanges,
  getMarksBetween,
} from '@tiptap/core'
import type { Plugin } from '@tiptap/pm/state'
import { Plugin as PmPlugin, PluginKey } from '@tiptap/pm/state'
import type { MultiToken } from 'linkifyjs'
import { find, tokenize, registerCustomProtocol, reset } from 'linkifyjs'
import { toast } from 'sonner'

// From DOMPurify - https://github.com/cure53/DOMPurify/blob/main/src/regexp.ts
const UNICODE_WHITESPACE_PATTERN = '[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]'
const UNICODE_WHITESPACE_REGEX = new RegExp(UNICODE_WHITESPACE_PATTERN)
const UNICODE_WHITESPACE_REGEX_END = new RegExp(`${UNICODE_WHITESPACE_PATTERN}$`)
const UNICODE_WHITESPACE_REGEX_GLOBAL = new RegExp(UNICODE_WHITESPACE_PATTERN, 'g')

/**
 * Check if the provided tokens form a valid link structure, which can either be a single link token
 * or a link token surrounded by parentheses or square brackets.
 */
function isValidLinkStructure(tokens: Array<ReturnType<MultiToken['toObject']>>) {
  if (tokens.length === 1) {
    return tokens[0].isLink
  }

  if (tokens.length === 3 && tokens[1].isLink) {
    return ['()', '[]'].includes(tokens[0].value + tokens[2].value)
  }

  return false
}

export interface LinkProtocolOptions {
  scheme: string
  optionalSlashes?: boolean
}

export const pasteRegex =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b(?:[-a-zA-Z0-9@:%._+~#=?!&/]*)(?:[-a-zA-Z0-9@:%._+~#=?!&/]*)/gi

export interface LinkOptions {
  /**
   * An array of custom protocols to be registered with linkifyjs.
   * @default []
   * @example ['ftp', 'git']
   */
  protocols: Array<LinkProtocolOptions | string>

  /**
   * Default protocol to use when no protocol is specified.
   * @default 'http'
   */
  defaultProtocol: string

  /**
   * If enabled, links will be opened on click.
   * @default true
   * @example false
   */
  openOnClick: boolean

  /**
   * If enabled, the link will be selected when clicked.
   * @default false
   * @example true
   */
  enableClickSelection: boolean

  /**
   * Adds a link to the current selection if the pasted content only contains a url.
   * @default true
   * @example false
   */
  linkOnPaste: boolean

  /**
   * If enabled, links will be created automatically when typing.
   * @default true
   * @example false
   */
  autolink: boolean

  /**
   * A validation function which is used for link verification for autolink.
   * @default () => true
   */
  shouldAutoLink: (url: string) => boolean

  /**
   * HTML attributes to add to the link element.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>

  /**
   * A validation function which is used for configuring link verification for preventing XSS attacks.
   * Only modify this if you know what you are doing.
   */
  isAllowedUri: (
    url: string,
    ctx: {
      defaultValidate: (url: string) => boolean
      protocols: Array<LinkProtocolOptions | string>
      defaultProtocol: string
    },
  ) => boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    link: {
      /**
       * Set a link mark
       * @param attributes The link attributes
       * @example editor.commands.setLink({ href: 'https://tiptap.dev' })
       */
      setLink: (attributes: {
        href: string
        target?: string | null
        rel?: string | null
        class?: string | null
        title?: string | null
      }) => ReturnType
      /**
       * Toggle a link mark
       * @param attributes The link attributes
       * @example editor.commands.toggleLink({ href: 'https://tiptap.dev' })
       */
      toggleLink: (attributes?: {
        href: string
        target?: string | null
        rel?: string | null
        class?: string | null
        title?: string | null
      }) => ReturnType
      /**
       * Unset a link mark
       * @example editor.commands.unsetLink()
       */
      unsetLink: () => ReturnType
    }
  }
}

export function isAllowedUri(uri: string | undefined, protocols?: LinkOptions['protocols']) {
  const allowedProtocols: string[] = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp', 'copy']

  if (protocols) {
    protocols.forEach(protocol => {
      const nextProtocol = typeof protocol === 'string' ? protocol : protocol.scheme

      if (nextProtocol) {
        allowedProtocols.push(nextProtocol)
      }
    })
  }

  return (
    !uri ||
    uri.replace(UNICODE_WHITESPACE_REGEX_GLOBAL, '').match(
      new RegExp(
        `^(?:(?:${allowedProtocols.join('|')}):|[^a-z]|[a-z0-9+.\-]+(?:[^a-z+.\-:]|$))`,
        'i',
      ),
    )
  )
}

/**
 * This extension allows you to create links.
 * Based on @tiptap/extension-link with autolink removed.
 * @see https://www.tiptap.dev/api/marks/link
 */
export const CustomLink = Mark.create<LinkOptions>({
  name: 'link',

  priority: 1000,

  keepOnSplit: false,

  exitable: true,

  onCreate() {
    this.options.protocols.forEach(protocol => {
      if (typeof protocol === 'string') {
        registerCustomProtocol(protocol)
        return
      }
      registerCustomProtocol(protocol.scheme, protocol.optionalSlashes)
    })
  },

  onDestroy() {
    reset()
  },

  addOptions() {
    return {
      openOnClick: true,
      enableClickSelection: false,
      linkOnPaste: true,
      autolink: true,
      shouldAutoLink: () => true,
      protocols: [],
      defaultProtocol: 'http',
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
        class: null,
      },
      isAllowedUri: (url: string, ctx: { protocols: Array<LinkProtocolOptions | string> }) =>
        !!isAllowedUri(url, ctx.protocols),
    }
  },

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML(element: HTMLElement) {
          return element.getAttribute('href')
        },
      },
      target: {
        default: this.options.HTMLAttributes.target,
      },
      rel: {
        default: this.options.HTMLAttributes.rel,
      },
      class: {
        default: this.options.HTMLAttributes.class,
      },
      title: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => {
          const href = dom.getAttribute('href')

          // prevent XSS attacks
          if (
            !href ||
            !this.options.isAllowedUri(href, {
              defaultValidate: url => !!isAllowedUri(url, this.options.protocols),
              protocols: this.options.protocols,
              defaultProtocol: this.options.defaultProtocol,
            })
          ) {
            return false
          }
          return null
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    // prevent XSS attacks
    if (
      !this.options.isAllowedUri(HTMLAttributes.href, {
        defaultValidate: href => !!isAllowedUri(href, this.options.protocols),
        protocols: this.options.protocols,
        defaultProtocol: this.options.defaultProtocol,
      })
    ) {
      // strip out the href
      return ['a', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, href: '' }), 0]
    }

    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  markdownTokenName: 'link',

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.applyMark('link', helpers.parseInline(token.tokens || []), {
      href: token.href,
      title: token.title || null,
    })
  },

  renderMarkdown: (node: any, h: any) => {
    const href = node.attrs?.href ?? ''
    const text = h.renderChildren(node)

    return text !== href ? `[${text}](${href})` : `${href}`;
  },

  addCommands() {
    return {
      setLink:
        attributes =>
        ({ chain }) => {
          const { href } = attributes

          if (
            !this.options.isAllowedUri(href, {
              defaultValidate: url => !!isAllowedUri(url, this.options.protocols),
              protocols: this.options.protocols,
              defaultProtocol: this.options.defaultProtocol,
            })
          ) {
            return false
          }

          return chain().setMark(this.name, attributes).setMeta('preventAutolink', true).run()
        },

      toggleLink:
        attributes =>
        ({ chain }) => {
          const { href } = attributes || {}

          if (
            href &&
            !this.options.isAllowedUri(href, {
              defaultValidate: url => !!isAllowedUri(url, this.options.protocols),
              protocols: this.options.protocols,
              defaultProtocol: this.options.defaultProtocol,
            })
          ) {
            return false
          }

          return chain()
            .toggleMark(this.name, attributes, { extendEmptyMarkRange: true })
            .setMeta('preventAutolink', true)
            .run()
        },

      unsetLink:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name, { extendEmptyMarkRange: true }).setMeta('preventAutolink', true).run()
        },
    }
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: (text: string) => {
          const foundLinks: PasteRuleMatch[] = []

          if (text) {
            const { protocols, defaultProtocol } = this.options
            const links = find(text).filter(
              (item: any) =>
                item.isLink &&
                this.options.isAllowedUri(item.value, {
                  defaultValidate: href => !!isAllowedUri(href, protocols),
                  protocols,
                  defaultProtocol,
                }),
            )

            if (links.length) {
              links.forEach((link: any) => {
                foundLinks.push({
                  text: link.value,
                  data: {
                    href: link.href,
                  },
                  index: link.start,
                })
              })
            }
          }

          return foundLinks
        },
        type: this.type,
        getAttributes: (match: any) => {
          return {
            href: match.data?.href,
          }
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const plugins: Plugin[] = []

    // Inlined clickHandler
    plugins.push(
      new PmPlugin({
        key: new PluginKey('handleClickLink'),
        props: {
          handleClick: (view, _pos, event) => {
            if ((event as MouseEvent).button !== 0) {
              return false
            }

            if (!view.editable) {
              return false
            }

            let link: HTMLAnchorElement | null = null

            if ((event as MouseEvent).target instanceof HTMLAnchorElement) {
              link = (event as MouseEvent).target as HTMLAnchorElement
            } else {
              const target = (event as MouseEvent).target as HTMLElement | null
              if (!target) {
                return false
              }

              const root = this.editor.view.dom
              link = target.closest<HTMLAnchorElement>('a')

              if (link && !root.contains(link)) {
                link = null
              }
            }
            if (!link) {
              return false
            }

            let handled = false

            const openOnClick = this.options.openOnClick
            const wantsOpen = openOnClick && (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey

            if (!wantsOpen && this.options.enableClickSelection) {
              const commandResult = this.editor.commands.extendMarkRange(this.type.name)
              handled = commandResult
            }
            

            if (wantsOpen) {
              const attrs = getAttributes(view.state, this.type.name) as {
                href?: string
                target?: string
              }
              const href = link.href ?? attrs.href
              const target = link.target ?? attrs.target
              console.log("href", href)

              if (href) {
                  if (href.startsWith('mailto:')) {
                      navigator.clipboard.writeText(href.replace(/^mailto:/, ''))
                      toast.success("copied to clipboard")
                  } else if (href.startsWith('copy:')) {
                    navigator.clipboard.writeText(href.replace(/^copy:/, ''))
                    toast.success("copied to clipboard")
                } else {
                  window.open(href, target)
                }
              }
              handled = true
            }

            return handled
          },
        },
      }),
    )

    // Inlined pasteHandler
    if (this.options.linkOnPaste) {
      plugins.push(
        new PmPlugin({
          key: new PluginKey('handlePasteLink'),
          props: {
            handlePaste: (view, _event, slice) => {
              const { state } = view
              const { selection } = state
              const { empty } = selection

              if (empty) {
                return false
              }

              let textContent = ''

              slice.content.forEach((node: any) => {
                textContent += node.textContent
              })

              const link = find(textContent, { defaultProtocol: this.options.defaultProtocol }).find(
                (item: any) => item.isLink && item.value === textContent,
              )

              if (!textContent || !link) {
                return false
              }

              return this.editor.commands.setMark(this.type, {
                href: (link as any).href,
              })
            },
          },
        }),
      )
    }

    // Inlined autolink
    if (this.options.autolink) {
      plugins.push(
        new PmPlugin({
          key: new PluginKey('autolink'),
          appendTransaction: (transactions, oldState, newState) => {
            const docChanges =
              transactions.some(transaction => transaction.docChanged) && !oldState.doc.eq(newState.doc)
            const preventAutolink = transactions.some(transaction => transaction.getMeta('preventAutolink'))

            if (!docChanges || preventAutolink) {
              return
            }

            const { tr } = newState
            const transform = combineTransactionSteps(oldState.doc, [...transactions])
            const changes = getChangedRanges(transform)

            changes.forEach(({ newRange }) => {
              const nodesInChangedRanges = findChildrenInRange(
                newState.doc,
                newRange,
                node => node.isTextblock,
              )

            let textBlock: NodeWithPos | undefined
            let textBeforeWhitespace: string | undefined

            if (nodesInChangedRanges.length > 1) {
              textBlock = nodesInChangedRanges[0]
              textBeforeWhitespace = newState.doc.textBetween(
                textBlock.pos,
                textBlock.pos + textBlock.node.nodeSize,
                undefined,
                ' ',
              )
            } else if (nodesInChangedRanges.length) {
              const endText = newState.doc.textBetween(newRange.from, newRange.to, ' ', ' ')
              if (!UNICODE_WHITESPACE_REGEX_END.test(endText)) {
                return
              }
              textBlock = nodesInChangedRanges[0]
              textBeforeWhitespace = newState.doc.textBetween(textBlock.pos, newRange.to, undefined, ' ')
            }

            if (textBlock && textBeforeWhitespace) {
              const wordsBeforeWhitespace = textBeforeWhitespace
                .split(UNICODE_WHITESPACE_REGEX)
                .filter(Boolean)

              if (wordsBeforeWhitespace.length <= 0) {
                return false
              }

              const lastWordBeforeSpace = wordsBeforeWhitespace[wordsBeforeWhitespace.length - 1]
              const lastWordAndBlockOffset =
                textBlock.pos + textBeforeWhitespace.lastIndexOf(lastWordBeforeSpace)

              if (!lastWordBeforeSpace) {
                return false
              }

              const linksBeforeSpace = tokenize(lastWordBeforeSpace).map(t =>
                t.toObject(this.options.defaultProtocol),
              )

              if (!isValidLinkStructure(linksBeforeSpace)) {
                return false
              }

              linksBeforeSpace
                .filter(link => link.isLink)
                .map(link => ({
                  ...link,
                  from: lastWordAndBlockOffset + link.start + 1,
                  to: lastWordAndBlockOffset + link.end + 1,
                }))
                .filter(link => {
                  if (!newState.schema.marks.code) {
                    return true
                  }
                  return !newState.doc.rangeHasMark(link.from, link.to, newState.schema.marks.code)
                })
                .filter(link =>
                  this.options.isAllowedUri(link.value, {
                    defaultValidate: href => !!isAllowedUri(href, this.options.protocols),
                    protocols: this.options.protocols,
                    defaultProtocol: this.options.defaultProtocol,
                  }),
                )
                .filter(link => this.options.shouldAutoLink(link.value))
                .forEach(link => {
                  if (
                    getMarksBetween(link.from, link.to, newState.doc).some(
                      item => item.mark.type === this.type,
                    )
                  ) {
                    return
                  }

                  tr.addMark(
                    link.from,
                    link.to,
                    this.type.create({
                      href: link.href,
                    }),
                  )
                })
            }
          })

          if (!tr.steps.length) {
            return
          }

          return tr
          },
        }),
      )
    }

    return plugins
  },
})
