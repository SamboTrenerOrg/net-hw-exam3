import {Message} from "../models/message";
import {BaseForumCommunicator} from "./baseForumCommunicator";
import * as signalR from '@microsoft/signalr'
import {HubConnection, LogLevel} from '@microsoft/signalr'
import {FetchHttpClient} from "@microsoft/signalr/dist/esm/FetchHttpClient";
import {ConsoleLogger} from "@microsoft/signalr/dist/esm/Utils";
import FileRepository from "../interfaces/fileRepository";
import Guid from "../models/guid";

const supportRole = 'support'
const userRole = 'user'

export class SignalrForumCommunicator extends BaseForumCommunicator {
    static messagePublishedFunction = "publishMessage";
    static fileUploadedFunction = "onFileUploaded";
    static onChatStartedFunction = "onChatStarted";
    static onChatEndedFunction = "onChatEnded";
    static endChatFunction = "endChat";
    static loginFunction = "login";

    connection: HubConnection
    role?: string
    username?: string

    constructor(readonly url: string,
                readonly fileRepository: FileRepository,
                readonly chatEndpoint: string = '/chat') {
        super();
        let fetchHttpClient = new FetchHttpClient(new ConsoleLogger(LogLevel.Debug));
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(this.endpoint, {
                withCredentials: false,
                httpClient: fetchHttpClient
            })
            .build();
    }

    get endpoint() {
        return `${this.url}${this.chatEndpoint}`
    }
    
    private getUsername(messageUsername: string): string {
        const oppositeName = this.role == supportRole ? 'Клиент' : 'Поддержка';
        return this.username === messageUsername ? 'Вы' : oppositeName;
    }

    async open() {
        this.connection.on(SignalrForumCommunicator.messagePublishedFunction,
            (username, message, requestId) => {
            
                let receivedMessage = {
                    username: this.getUsername(username),
                    message,
                    requestId: requestId === undefined || requestId === null || requestId === ''
                        ? undefined
                        : new Guid(requestId),
                };
                
                console.log('Received published message', receivedMessage);
                this.notifyMessage(receivedMessage);
            });
        this.connection.on(SignalrForumCommunicator.fileUploadedFunction,
            (requestId: string, fileId: string, metadata: string) => {
                let uploadedFile = {
                    fileId: new Guid(fileId),
                    requestId: new Guid(requestId),
                    metadata: new Map(Object.entries(JSON.parse(metadata))
                        .map(([x, y]) => ([String(x), String(y)]))),
                    contentUrl: this.fileRepository.createContentUrl(new Guid(fileId))
                };
                console.log('Received file info', uploadedFile)
                this.notifyFileUploaded(uploadedFile)
            });
        this.connection.on(SignalrForumCommunicator.onChatStartedFunction, 
            (role: string) => {
                console.log('Чат стартовал', {
                    role
                })
                this.role = role
                this.notifyChatStarted();
            })

        this.connection.on(SignalrForumCommunicator.onChatEndedFunction, () => {
            console.log('Чат окончен')
            this.notifyChatEnded()
        })
        console.log('Соединение открывается')
        await this.connection.start();
    }

    async close() {
        console.log('Соединение закрывается')
        await this.connection.stop();
    }

    async sendMessage(msg: Message): Promise<void> {
        await this.connection.send(SignalrForumCommunicator.messagePublishedFunction,
            msg.message,
            msg.requestId?.value ?? null)
            .catch(e => {
                console.error('Could not send message', {
                    error: e
                });
        });
    }

    async endChat(): Promise<void> {
        await this.connection.send(SignalrForumCommunicator.endChatFunction);
    }

    async login(username: string): Promise<void> {
        await this.connection.send(SignalrForumCommunicator.loginFunction, username);
        this.username = username
    }
}