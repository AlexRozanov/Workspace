import { WsMetadataTextEditorComponent } from './editors/ws-metadata-text-editor/ws-metadata-text-editor.component';
import { WsVideoTools } from './../ws-player/ws-video-tools';
import { SaveMetadataRequest } from './save-metadata-request';
import { WsMetadataService } from './ws-metadata.service';
import { WsMamError } from './../shared/services/ws-base-mam/ws-mam-error';
import { WsAppManagementService } from './../ws-app-management.service';
import { WsAppStateService } from './../ws-app-state.service';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MAT_MOMENT_DATE_FORMATS, MomentDateAdapter } from '@angular/material-moment-adapter';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import * as moment from 'moment';
import * as _ from 'lodash';
import { MatDialog, MatSnackBar } from '@angular/material';
import { MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-ws-metadata',
  templateUrl: './ws-metadata.component.html',
  styleUrls: ['./ws-metadata.component.css'],
  providers: [
    // `MomentDateAdapter` and `MAT_MOMENT_DATE_FORMATS` can be automatically provided by importing
    // `MatMomentDateModule` in your applications root module. We provide it at the component level
    // here, due to limitations of our example generation script.
    { provide: DateAdapter, useClass: MomentDateAdapter, deps: [MAT_DATE_LOCALE] },
    { provide: MAT_DATE_FORMATS, useValue: MAT_MOMENT_DATE_FORMATS }
  ],
})
export class WsMetadataComponent implements OnInit, OnDestroy {
  private videoHelper = new WsVideoTools();
  public subscribers: any[];
  public descriptorGroups: any[];
  public descriptors: any[];
  public selectedNode: any;
  public selectedMetadata: any;
  public selectedMetadataOpState = WsOperationState.None;
  public loading = false;

  constructor(
    public appState: WsAppStateService,
    public management: WsAppManagementService,
    private metadataService: WsMetadataService,
    public dialog: MatDialog,
    public snackBar: MatSnackBar) {
    this.subscribers = [];

    let subscriber = this.appState.selectNodeSubject
      .subscribe(response => this.selectedNodeResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.appState.deleteNodeSubject
      .subscribe(response => this.nodeDeletedResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.appState.updateNodeSubject
      .subscribe(response => this.nodeUpdatedResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.metadataService.getDescriptorsSubject
      .subscribe(response => this.getDescriptorsResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.metadataService.getMetadataSubject
      .subscribe(response => this.getMetadataResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.metadataService.setMetadataSubject
      .subscribe(response => this.setMetadataResponse(response));
    this.subscribers.push(subscriber);

    subscriber = this.metadataService.undoSetMetadataSubject
    .subscribe(response => this.undoSetMetadataResponse(response));
  this.subscribers.push(subscriber);
  }

  ngOnInit() {
  }

  ngOnDestroy() {
    this.subscribers.forEach(element => {
      element.unsubscribe();
    });
  }

  public saveMetadata(item, undo: boolean) {
    const metadata = new SaveMetadataRequest();

    metadata.descriptorId = item.id;

    switch (item.type) {
      case 'date':
        metadata.value = item.value.value.format();
        break;
      default:
        metadata.value = item.value.value;
        break;
    }

    this.selectedMetadata = item;

    if (undo) {
      this.metadataService.undoSetMetadata(this.selectedNode.id, metadata);
    } else {
      this.metadataService.setMetadata(this.selectedNode.id, metadata);
    }
  }

  /* *** Service Respomses *** */

  private selectedNodeResponse(response: any) {
    this.loading = false;
    if (response instanceof WsMamError) {
      return;
    }

    if (this.selectedNode && response.id === this.selectedNode.id) {
      return;
    }

    this.selectedNode = response;
    this.descriptorGroups = [];
    this.descriptors = this.appState.descriptors[this.selectedNode.type];

    if (this.descriptors === undefined) {
      this.loading = true;
      this.metadataService.getDescriptors(this.selectedNode.type);
    } else if (this.selectedNode.metadata) {
      this.loading = true;
      this.metadataService.getMetadata(this.selectedNode);
    }
  }

  private getDescriptorsResponse(response) {
    this.loading = false;
    if (response instanceof WsMamError) {
      return;
    }

    this.descriptors = response;
    this.appState.descriptors[this.selectedNode.type] = response;

    if (this.selectedNode.metadata) {
      this.metadataService.getMetadata(this.selectedNode);
    }
  }

  private getMetadataResponse(response) {
    this.loading = false;
    if (response instanceof WsMamError) {
      return;
    }

    this.sortDescriptors(this.descriptors, response.items);
  }

  private nodeDeletedResponse(response) {
    if (response instanceof WsMamError) {
      return;
    }

    if (response.id !== this.selectedNode.id) {
      return;
    }

    this.descriptors = [];
    this.descriptorGroups = [];
    this.selectedNode = null;
  }

  private nodeUpdatedResponse(response) {
    if (response instanceof WsMamError) {
      return;
    }

    if (response.id !== this.selectedNode.id) {
      return;
    }

    this.selectedNode = response;
  }

  private setMetadataResponse(response) {
    if (response instanceof WsMamError) {
      return;
    }

    this.snackBar.open('Metadata item saved', null, { duration: 1000 });
  }

  private undoSetMetadataResponse(response) {
    if (response instanceof WsMamError) {
      return;
    }

    this.snackBar.open('Undo successfull', null, { duration: 1000 });
  }

  /* *** Private *** */
  private sortDescriptors(descriptors, metadata) {
    const tmpGroups = {};
    let durationDescriptorCreated = false;

    for (const descriptor of descriptors) {
      descriptor.value = { name: null, value: null };
      const group = tmpGroups[descriptor.group.id];

      // tslint:disable-next-line:max-line-length
      if (!durationDescriptorCreated && group && group[0] && group[0].group.name.toLowerCase() === 'clip' && this.selectedNode.videoFormat) {
        const durationDescriptor = {
          group: group[0].group,
          name: 'Duration',
          nameInternal: 'duration',
          type: 'timecode',
          isReadOnly: true,
          value: {
            // tslint:disable-next-line:max-line-length
            value: this.videoHelper.getTimecodeString(this.selectedNode.videoFormat, this.videoHelper.getDuration(this.selectedNode))
          }
        };
        group.push(group[0]);
        group[0] = durationDescriptor;
        durationDescriptorCreated = true;
      }

      for (let i = 0; i < metadata.length; i++) {
        const item = metadata[i];

        if (item.descriptorId === descriptor.id && item.value) {
          switch (descriptor.type) {
            case 'bool':
              if (item.value.value === 'False') {
                item.value.value = false;
              } else {
                item.value.value = true;
              }
              descriptor.value = item.value;
              break;
            case 'timecode':
              if (this.selectedNode.videoFormat) {
                item.value.value = this.videoHelper.getTimecodeString(this.selectedNode.videoFormat, item.value.value / 10000000);
              }
              descriptor.value = item.value;
              break;
            case 'date':
              item.value.value = moment(item.value.value, ['MM-DD-YYYY', moment.ISO_8601]);
              descriptor.value = item.value;
              break;
            default:
              descriptor.value = item.value;
              break;
          }
          descriptor.backup = _.cloneDeep(descriptor.value);
          break;
        }
      }

      if (group === undefined) {
        tmpGroups[descriptor.group.id] = [];
      }

      if (this.selectedNode.videoFormat && descriptor.nameInternal === 'pd_tv_format_desc') {
        descriptor.value.value = this.selectedNode.videoFormat.name;
      }

      tmpGroups[descriptor.group.id].push(descriptor);
    }

    // tslint:disable-next-line:forin
    for (const key in tmpGroups) {
      const value = tmpGroups[key];
      this.descriptorGroups.push(value);
    }

    this.descriptors = [];
  }

  /* *** Events *** */
  public inputFocused(item) {
    console.log(`Metadata focused: ${item.name}`);
  }

  public inputValueChanged(item) {
    console.log(`Metadata values changed: ${item.name}`);
  }

  public inputKeyPressed(item, event) {
    if (event.defaultPrevented) {
      return;
    }

    switch (event.key) {
      case 'Enter':
        if (item.value.value != null)  {
          this.saveMetadata(item, false);
          item.backup =  _.cloneDeep(item.value);
        }
        break;
      case 'Escape':
        if (item.backup) {
          item.value.value = item.backup.value;
        } else {
          item.value.value = null;
        }
        break;
      default:
        break;
    }
  }

  public inputLostFocus(item) {
    console.log(`Metadata lost focus: ${item.name}`);
  }

  public textClicked(item) {
    this.openEditTextDialog(item);
  }

  private openEditTextDialog(item) {
    const dialogRef = this.dialog.open(WsMetadataTextEditorComponent, {
      width: '600px',
      height: '380px',
      data: item
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result == null) {
        if (item.backup == null) {
          item.value.value = null;
          return;
        }
        item.value.name = item.backup.name;
        item.value.value = item.backup.value;
        return;
      }
      this.saveMetadata(result, false);
    });
  }

  public dateClicked(picker, item) {
    if (item.isReadOnly) {
      return;
    }

    picker.open();
  }

  public addDateEvent(type: string, event: MatDatepickerInputEvent<Date>, item) {
    item.value.value = moment(event.value);
    this.saveMetadata(item, false);
  }

  public selectValueChanged(item, event) {
   this.saveMetadata(item, false);
  }

  public checkBoxValueChanged(item, event) {
    this.saveMetadata(item, false);
  }

  public undoMetadata(item) {
    if (item.backup == null || item.value.value === item.backup.value) {
      this.snackBar.open('Nothing to undo - there are no changes', null, { duration: 2000 });
      return;
    }

    item.value.name = item.backup.name;
    item.value.value = item.backup.value;
    this.saveMetadata(item, true);
  }
}

export enum WsOperationState {
  None,
  Save,
  Undo
}