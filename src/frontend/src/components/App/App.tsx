import React, {FC, useState} from 'react';
import './App.css';
import ChatPage from "../ChatPage/ChatPage";
import {useEffectOnce} from "../../hooks/useEffectOnce";
import {AppProps} from "./AppProps";

const App: FC<AppProps> = ({forumHandler, fileRepository}) => {
    const [username, setUsername] = useState('');

    const minNameLength = 5;

    useEffectOnce(() => {
        let name: string | null = null;
        let message = `Введите ваше имя (Минимум ${minNameLength} символов)`;
        while (!name || name.length < minNameLength) {
            name = window.prompt(message);
            if (name) {
                name = name.trim();
            }
            message = `Кому не понятно? Минимальная длина - ${minNameLength}. Еще раз!`
        }

        setUsername(name!);
    });

    return (
        username 
            ? <div className={'container-lg h-100'}>
                <ChatPage forumHandler={forumHandler}
                          username={username}
                          fileRepository={fileRepository}/>
            </div>
            : <h1>Введите свое имя</h1>
    );
};

export default App;
