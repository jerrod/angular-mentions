import { Directive, ElementRef, Input, ComponentFactoryResolver, ViewContainerRef, TemplateRef } from "@angular/core";
import { EventEmitter, Output, OnInit, OnChanges, SimpleChanges } from "@angular/core";

import { MentionListComponent } from './mention-list.component';
import { getValue, insertValue, getCaretPosition, setCaretPosition, getWordFromCaretPosition } from './mention-utils';

const KEY_BACKSPACE = 8;
const KEY_TAB = 9;
const KEY_ENTER = 13;
const KEY_SHIFT = 16;
const KEY_ESCAPE = 27;
const KEY_SPACE = 32;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
const KEY_2 = 50;

/**
 * Angular 2 Mentions.
 * https://github.com/dmacfarlane/angular-mentions
 *
 * Copyright (c) 2017 Dan MacFarlane
 */
@Directive({
  selector: '[mention]',
  host: {
    '(keydown)': 'keyHandler($event)',
    '(blur)': 'blurHandler($event)'
  }
})
export class MentionDirective implements OnInit, OnChanges {

  @Input() set mention(items: any[]) {
    this.items = items;
  }

  @Input() set mentionConfig(config: any) {
    this.triggerChar = config.triggerChar || this.triggerChar;
    this.keyCodeSpecified = typeof this.triggerChar === 'number';
    this.labelKey = config.labelKey || this.labelKey;
    this.disableSearch = config.disableSearch || this.disableSearch;
    this.maxItems = config.maxItems || this.maxItems;
    this._filterKeys = config.filterKeys || this._filterKeys;
    this.insertHTML = config.insertHTML || this.insertHTML;
    this.mentionSelect = config.mentionSelect || this.mentionSelect;
    this._showListHeader = config.showListHeader || this._showListHeader;
    this._maxHeight = config.maxHeight || this._maxHeight;
    this._minWidth = config.minWidth || this._minWidth;
    this._maxWidth = config.maxWidth || this._maxWidth;
    this._positionType = config.positionType || this._positionType;
    this._xPos = parseInt(config.xPos, 10) || this._xPos;
    this._yPos = parseInt(config.yPos, 10) || this._yPos;
    this._listItemHeight = config.listItemHeight || this._listItemHeight;
  }

  // template to use for rendering list items
  @Input() mentionListTemplate: TemplateRef<any>;

  // event emitted whenever the search term changes
  @Output() searchTerm = new EventEmitter();

  // the character that will trigger the menu behavior
  private triggerChar: string | number = "@";

  // option to specify the field in the objects to be used as the item label
  private labelKey: string = 'label';

  // option to diable internal filtering. can be used to show the full list returned
  // from an async operation (or allows a custom filter function to be used - in future)
  private disableSearch: boolean = false;

  // option to limit the number of items shown in the pop-up menu
  private maxItems: number = -1;

  /**
   * : string[]
   * Option to pass in multiple filter keys. For example, if you wish to filter by Full Name and username.
   */
  private _filterKeys: string[] = ['label'];

  /**
   * : boolean
   * Option to show or hide the 'People Matching' bar at the top of the list.
   */
  private _showListHeader = false;

  /**
   * : number
   * Option to set a max height for the list. Value is in px.
   */
  private _maxHeight = 300;

  /**
   * : number
   * Option to set a min width for the list. Value is in px.
   */
  private _minWidth = 250;

  /**
   * : number
   * Option to set a max width for the list. Value is in px.
   */
  private _maxWidth = 500;

  /**
   * : string
   * Options to set the position type of the list. Options are 'above', 'below', 'cursor' and 'detect'.
   */
  private _positionType = 'cursor';

  /**
   * : number
   * Option to override the x-coordinate of the list for position.
   */
  private _xPos = 0;

  /**
   * : number
   * Option to override the y-coordinate of the list for position.
   */
  private _yPos = 0;

  /**
   * : number
   * Option to override the default height of the boostrap <li> element.
   * Default height is 26px.
   */
  private _listItemHeight = 26;

  //Insert Text (false) or HTML (true)
  private insertHTML:boolean = false;

  // optional function to format the selected item before inserting the text
  private mentionSelect: (item: any) => (string) = (item: any) => this.triggerChar + item[this.labelKey];

  searchString: string;
  startPos: number;
  items: any[];
  startNode;
  searchList: MentionListComponent;
  stopSearch: boolean;
  iframe: any; // optional
  keyCodeSpecified: boolean;

  constructor(
    private _element: ElementRef,
    private _componentResolver: ComponentFactoryResolver,
    private _viewContainerRef: ViewContainerRef
  ) { }

  ngOnInit() {
    if (this.items && this.items.length > 0) {
      if (typeof this.items[0] == 'string') {
        // convert strings to objects
        const me = this;
        this.items = this.items.map(function (label) {
          let object = {};
          object[me.labelKey] = label;
          return object;
        });
      }
      // remove items without an labelKey (as it's required to filter the list)
      this.items = this.items.filter(e => e[this.labelKey]);
      this.items.sort((a, b) => a[this.labelKey].localeCompare(b[this.labelKey]));
      if (this.searchList && !this.searchList.hidden) {
        this.updateSearchList();
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mention']) {
      this.ngOnInit();
    }
  }

  setIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  stopEvent(event: any) {
    // if (event instanceof KeyboardEvent) { // does not work for iframe
    if (!event.wasClick) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  blurHandler(event: any) {
    if (this.getPlatform() !== 'iOS') {
      this.stopEvent(event);
      this.stopSearch = true;
      if (this.searchList) {
        this.searchList.hidden = true;
      }
    }
  }

  keyHandler(event: any, nativeElement: HTMLInputElement = this._element.nativeElement) {
    let val: string = getValue(nativeElement);
    if (val) {
      val = val.trim();
    }
    if (this.getPlatform() === 'Android' && val.length > 0 && val.indexOf('@') === -1) {
      return ;
    }
    let pos = getCaretPosition(nativeElement, this.iframe);
    let charPressed = this.keyCodeSpecified ? event.keyCode : event.key;
    if (!charPressed) {
      var charCode = event.which || event.keyCode;
      if (!event.shiftKey && (charCode >= 65 && charCode <= 90)) {
        charPressed = String.fromCharCode(charCode + 32);
      }
      else if (event.shiftKey && charCode === KEY_2) {
        charPressed = this.triggerChar;
      }
      else {
        // TODO (dmacfarlane) fix this for non-alpha keys
        // http://stackoverflow.com/questions/2220196/how-to-decode-character-pressed-from-jquerys-keydowns-event-handler?lq=1
        charPressed = String.fromCharCode(event.which || event.keyCode);
      }
    } else if (charPressed === 'Unidentified' && event.keyCode === 229) {
      charPressed = val.charAt(pos - 1);
    }
    if (event.keyCode == KEY_ENTER && event.wasClick && pos < this.startPos) {
      // put caret back in position prior to contenteditable menu click
      pos = this.startNode.length;
      setCaretPosition(this.startNode, pos, this.iframe);
    }
    // console.log("keyHandler", this.startPos, pos, val, charPressed, event);
    if (charPressed === this.triggerChar) {
      this.startPos = pos;
      this.startNode = (this.iframe ? this.iframe.contentWindow.getSelection() : window.getSelection()).anchorNode;
      this.stopSearch = false;
      this.searchString = null;
      if (this.searchList) {
        this.searchList.searchString = null;
      }
      this.showSearchList(nativeElement);
      this.updateSearchList(nativeElement);
    }
    else if (this.startPos >= 0 && !this.stopSearch) {
      if (pos <= this.startPos) {
        this.searchList.hidden = true;
      }
      // ignore shift when pressed alone, but not when used with another key
      else if (event.keyCode !== KEY_SHIFT &&
        !event.metaKey &&
        !event.altKey &&
        !event.ctrlKey &&
        pos > this.startPos
      ) {
        if (event.keyCode === KEY_SPACE) {
          this.startPos = -1;
        }
        else if (event.keyCode === KEY_BACKSPACE && pos > 0) {
          pos--;
          if (pos == 0) {
            this.stopSearch = true;
          }
          this.searchList.hidden = this.stopSearch;
        }
        else if (!this.searchList.hidden) {
          if (event.keyCode === KEY_TAB || event.keyCode === KEY_ENTER) {
            this.stopEvent(event);
            this.searchList.hidden = true;
            // value is inserted without a trailing space for consistency
            // between element types (div and iframe do not preserve the space)
            insertValue(nativeElement, this.startPos, pos,
              this.insertHTML,
              this.mentionSelect(this.searchList.activeItem), this.iframe);
            this.searchString = null;
            this.searchList.searchString = null;
            // fire input event so angular bindings are updated
            if ('createEvent' in document) {
              var evt = document.createEvent('HTMLEvents');
              evt.initEvent("input", false, true);
              nativeElement.dispatchEvent(evt);
            }
            this.startPos = -1;
            return false;
          }
          else if (event.keyCode === KEY_ESCAPE) {
            this.stopEvent(event);
            this.searchList.hidden = true;
            this.stopSearch = true;
            return false;
          }
          else if (event.keyCode === KEY_DOWN) {
            this.stopEvent(event);
            this.searchList.activateNextItem();
            return false;
          }
          else if (event.keyCode === KEY_UP) {
            this.stopEvent(event);
            this.searchList.activatePreviousItem();
            return false;
          }
        }

        if (event.keyCode === KEY_LEFT || event.keyCode === KEY_RIGHT) {
          this.stopEvent(event);
          return false;
        }
        else {
          let mention;
          if (this.getPlatform() === 'Android') {
            mention = val.substring(this.startPos, pos - 1);
          } else {
            mention = val.substring(this.startPos + 1, pos);
          }
          if (event.keyCode !== KEY_BACKSPACE) {
            mention += charPressed;
          }
          this.searchString = mention;
          this.searchTerm.emit(this.searchString);
          this.updateSearchList(nativeElement);
        }
      }
    } else {
      let wordFromCaretPosition = getWordFromCaretPosition(nativeElement);
      if (wordFromCaretPosition.startsWith(this.triggerChar.toString())) {
        wordFromCaretPosition = wordFromCaretPosition.substring(1);
        pos = getCaretPosition(nativeElement);
        let editStartPos = pos - wordFromCaretPosition.length;
        if (event.keyCode !== KEY_SHIFT &&
          !event.metaKey &&
          !event.altKey &&
          !event.ctrlKey &&
          pos >= editStartPos
        ) {
          if (event.keyCode === KEY_SPACE) {
            editStartPos = -1;
          }
          else if (event.keyCode === KEY_BACKSPACE && pos > 0) {
            pos--;
            if (pos === 0 || pos < editStartPos) {
              this.stopSearch = true;
            } else {
              this.stopSearch = false;
            }
            this.searchList.hidden = this.stopSearch;
            if (!this.stopSearch) {
              this.searchString = wordFromCaretPosition.substring(0, wordFromCaretPosition.length - 1);
              this.searchTerm.emit(this.searchString);
              this.updateSearchList(nativeElement);
            }
          }
          else if (!this.searchList.hidden) {
            if (event.keyCode === KEY_TAB || event.keyCode === KEY_ENTER) {
              this.stopEvent(event);
              this.searchList.hidden = true;
              // value is inserted without a trailing space for consistency
              // between element types (div and iframe do not preserve the space)
              insertValue(nativeElement, editStartPos - 1, pos,
                this.insertHTML,
                this.mentionSelect(this.searchList.activeItem), this.iframe);
              this.searchString = null;
              this.searchList.searchString = null;
              // fire input event so angular bindings are updated
              if ('createEvent' in document) {
                var evt = document.createEvent('HTMLEvents');
                evt.initEvent("input", false, true);
                nativeElement.dispatchEvent(evt);
              }
              editStartPos = -1;
              return false;
            }
            else if (event.keyCode === KEY_ESCAPE) {
              this.stopEvent(event);
              this.searchList.hidden = true;
              this.stopSearch = true;
              return false;
            }
            else if (event.keyCode === KEY_DOWN) {
              this.stopEvent(event);
              this.searchList.activateNextItem();
              return false;
            }
            else if (event.keyCode === KEY_UP) {
              this.stopEvent(event);
              this.searchList.activatePreviousItem();
              return false;
            } else {
              let mention = wordFromCaretPosition;
              if (event.keyCode !== KEY_BACKSPACE) {
                mention += charPressed;
              }
              this.searchString = mention;
              this.searchTerm.emit(this.searchString);
              this.updateSearchList(nativeElement);
            }
          }
          else {
            let mention = wordFromCaretPosition;
            if (event.keyCode !== KEY_BACKSPACE) {
              mention += charPressed;
            }
            this.searchString = mention;
            this.searchTerm.emit(this.searchString);
            this.updateSearchList(nativeElement);
          }
        }
      }
    }
  }

  getPlatform() {
    const userAgent = window.navigator.userAgent,
      platform = window.navigator.platform,
      macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod'];
      let os = null;
      if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
      } else if (iosPlatforms.indexOf(platform) !== -1) {
        os = 'iOS';
      } else if (windowsPlatforms.indexOf(platform) !== -1) {
        os = 'Windows';
      } else if (/Android/.test(userAgent)) {
        os = 'Android';
      } else if (!os && /Linux/.test(platform)) {
        os = 'Linux';
      }
      return os;
  }

  updateSearchList(nativeElement?: HTMLInputElement) {
    let matches: any[] = [];
    if (this.items) {
      let objects = this.items;
      // disabling the search relies on the async operation to do the filtering
      if (!this.disableSearch && this.searchString) {
        const searchStringLowerCase = this.searchString.toLowerCase();
        objects = this.items.filter(e => {
          let hasValue = false;
          this._filterKeys.forEach(key => {
            if (!hasValue) {
              hasValue = e[key].toLowerCase().includes(searchStringLowerCase);
            }
          });
          return hasValue;
        });
      }
      matches = objects;
      if (this.maxItems > 0) {
        matches = matches.slice(0, this.maxItems);
      }
    }
    // update the search list
    if (this.searchList) {
      this.searchList.items = matches;
      this.searchList.hidden = matches.length === 0;
      if (this.searchString !== null) {
        this.searchList.searchString = this.searchString.toLowerCase();
      }
      if (nativeElement) {
        this.searchList.updatePosition(nativeElement, this._positionType, this.searchList.items.length, this._xPos, this._yPos);
      }
    }
  }

  showSearchList(nativeElement: HTMLInputElement) {
    if (this.searchList == null) {
      const componentFactory = this._componentResolver.resolveComponentFactory(MentionListComponent);
      const componentRef = this._viewContainerRef.createComponent(componentFactory);
      this.searchList = componentRef.instance;
      this.searchList.triggerChar = this.triggerChar;
      this.searchList.maxHeight = this._maxHeight;
      this.searchList.minWidth = this._minWidth;
      this.searchList.maxWidth = this._maxWidth;
      this.searchList.listItemHeight = this._listItemHeight;
      this.searchList.showListHeader = this._showListHeader;
      this.searchList.searchString = null;
      this.searchList.position(nativeElement, this.iframe, this._positionType, this._xPos, this._yPos);
      this.searchList.itemTemplate = this.mentionListTemplate;
      this.searchList.labelKey = this.labelKey;
      componentRef.instance['itemClick'].subscribe(() => {
        nativeElement.focus();
        let fakeKeydown = { "keyCode": KEY_ENTER, "wasClick": true };
        this.keyHandler(fakeKeydown, nativeElement);
      });
    } else {
      this.searchList.activeIndex = 0;
      this.searchList.position(nativeElement, this.iframe, this._positionType, this._xPos, this._yPos);
      window.setTimeout(() => this.searchList.resetScroll());
    }
  }
}
